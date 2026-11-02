"""Explicit private final Ridge refit; no new external validation or promotion."""
import argparse
import ast
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import numpy as np
import pandas as pd
from sklearn.model_selection import KFold

from training.import_forms import import_official_forms_csv
from training.regression_preprocessing import ALLOWED_PREDICTORS
from training.regression_models import build_regression_pipeline
from training.regression_inference import InferenceContract, save_private_pipeline, runtime_versions
from training.regression_evaluation import calculate_regression_metrics
from training.private_v2_contracts import validate_paths
from training.run_private_optimization_v2 import _read, _write, _private_permissions, _offline_scope, describe_runtime, MAX_INPUT_BYTES

VERSION = 'ridge-dimensional-time-candidate-v1'
REPOSITORY = Path(__file__).resolve().parents[2]


def load_generator_functions(corrected_source, original_source, *, corrected_sha256, original_sha256):
    """Load exact reviewed function bodies, not unrelated experiment imports.

    Hash is integrity, not trust; train() separately requires a trusted local
    generator. This is not a Python sandbox. No formulas or RNG calls are changed.
    """
    digest=lambda b:hashlib.sha256(b).hexdigest()
    if digest(corrected_source)!=corrected_sha256 or digest(original_source)!=original_sha256:
        raise ValueError('GENERATOR_PROVENANCE_MISMATCH')
    from training.form_schema import CONTEXT_FIELDS, ELIGIBILITY_FIELDS, ESBEU_FIELDS, SpecialValue, validate_record
    namespace=dict(np=np,CONTEXT_FIELDS=CONTEXT_FIELDS,ELIGIBILITY_FIELDS=ELIGIBILITY_FIELDS,
                   ESBEU_FIELDS=ESBEU_FIELDS,SpecialValue=SpecialValue,validate_record=validate_record)

    def definitions(source,names,scope):
        tree=ast.parse(source)
        chosen=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in names]
        if len(chosen)!=len(names) or {node.name for node in chosen}!=set(names) or any(node.decorator_list for node in chosen):
            raise ValueError('GENERATOR_FUNCTIONS_MISMATCH')
        exec(compile(ast.Module(body=chosen,type_ignores=[]),'<trusted-generator-functions>','exec'),scope)
        return tree

    definitions(original_source,('generate',),namespace)
    proposal=namespace['generate']
    tree=ast.parse(corrected_source);constants={}
    for node in tree.body:
        if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name):
            if node.targets[0].id in ('VERSION','RESERVE_HOURS_WEEK'):
                constants[node.targets[0].id]=ast.literal_eval(node.value)
    if constants!={'VERSION':'dimensional-weekly-budget/2','RESERVE_HOURS_WEEK':21.}:
        raise ValueError('GENERATOR_CONSTANTS_MISMATCH')
    namespace.update(constants,ORIGINAL={'generate':proposal})
    definitions(corrected_source,('weekly_hours','generate'),namespace)
    return SimpleNamespace(generate=namespace['generate'],VERSION=constants['VERSION'],ORIGINAL_SOURCE_SHA256=original_sha256)


def fit_candidate(data, generator):
    """3-fold real validation seed42, alpha1/10; synthetic generator refit per training."""
    if (tuple(data.X.columns) != ALLOWED_PREDICTORS or data.predictors != ALLOWED_PREDICTORS
            or len(data.y)<6 or not np.isfinite(data.y).all() or not data.y.between(0,4).all()):
        raise ValueError('INVALID_TRAINING_CONTRACT')

    def mixed(indices, seed):
        from training.regression_preprocessing import prepare_regression_data
        x,y=data.X.iloc[indices],data.y.iloc[indices]
        records,diagnostic=generator(seed,[tuple(str(v) for v in row) for row in x.to_numpy()])
        s=prepare_regression_data(records)
        if len(s.y)!=100 or diagnostic['reserve_hours_week']!=21 or diagnostic['accepted']!=100:
            raise ValueError('GENERATOR_CONTRACT_FAILED')
        return pd.concat([x,s.X],ignore_index=True),pd.concat([y,s.y],ignore_index=True),diagnostic

    inner=tuple(KFold(3,shuffle=True,random_state=42).split(data.X));pools=[]
    for j,(train,validation) in enumerate(inner):
        if set(train)&set(validation):raise ValueError('INVALID_SPLIT')
        seed=int(np.random.SeedSequence([42,0,0,j+1]).generate_state(1)[0])
        pools.append(mixed(train,seed))
    scores=[]
    for alpha in (1.,10.):
        metrics=[]
        for (tr,te),(x,y,_) in zip(inner,pools,strict=True):
            model=build_regression_pipeline('ridge',model_params={'alpha':alpha})
            model.fit(x,y,regressor__sample_weight=np.r_[np.ones(len(tr)),np.full(100,.25)])
            metrics.append(calculate_regression_metrics(data.y.iloc[te].to_numpy(),model.predict(data.X.iloc[te])))
        scores.append(dict(alpha=alpha,mae=float(np.mean([m.mae for m in metrics])),rmse=float(np.mean([m.rmse for m in metrics]))))
    chosen=min(range(2),key=lambda i:(scores[i]['mae'],scores[i]['rmse'],i));alpha=scores[chosen]['alpha']
    x,y,diagnostic=mixed(np.arange(len(data.y)),42)
    model=build_regression_pipeline('ridge',model_params={'alpha':alpha})
    model.fit(x,y,regressor__sample_weight=np.r_[np.ones(len(data.y)),np.full(100,.25)])
    return model,dict(alpha=alpha,internal_selection_scores=scores,final_generation=diagnostic,
        synthetic_input_sha256=hashlib.sha256(pd.util.hash_pandas_object(x.iloc[len(data.y):],index=False).to_numpy().tobytes()+y.iloc[len(data.y):].to_numpy().tobytes()).hexdigest())


def train(source,experiment_dir,output,private_root,*,trusted_generator=False):
    source,experiment_dir,output,private_root=map(Path,(source,experiment_dir,output,private_root))
    if trusted_generator is not True:raise ValueError('TRUSTED_GENERATOR_REQUIRED')
    validate_paths(source,output,repository=REPOSITORY,private_root=private_root)
    validate_paths(experiment_dir/'generator.py',output,repository=REPOSITORY,private_root=private_root)
    _private_permissions([source,source.parent,output.parent,experiment_dir,experiment_dir/'generator.py'])
    raw=_read(source,MAX_INPUT_BYTES);meta_raw=_read(experiment_dir/'manifest.json',MAX_INPUT_BYTES)
    meta=json.loads(meta_raw);generator_bytes=_read(experiment_dir/'generator.py',MAX_INPUT_BYTES)
    integrity=json.loads(_read(experiment_dir/'integrity.sha256.json',MAX_INPUT_BYTES))
    reference=_read(experiment_dir/'results.aggregate.json',MAX_INPUT_BYTES)
    digest=lambda b:hashlib.sha256(b).hexdigest()
    if (digest(raw)!=meta['input_sha256'] or digest(generator_bytes)!=meta['corrected_generator_sha256']
            or digest(reference)!=integrity['results.aggregate.json']
            or meta['version']!='dimensional-weekly-budget/2' or meta['reserve_hours_week']!=21
            or meta['synthetic_weight']!=.25):raise ValueError('PROVENANCE_MISMATCH')
    original_path=experiment_dir.parent/'dimensional-plus100-20261102-01'/'experiment.py'
    validate_paths(original_path,output,repository=REPOSITORY,private_root=private_root)
    original_bytes=_read(original_path,MAX_INPUT_BYTES)
    if digest(original_bytes)!=meta['original_generator_source_sha256']:
        raise ValueError('GENERATOR_PROVENANCE_MISMATCH')
    runtime=describe_runtime()
    if runtime['protocol_sha256']!=meta['runtime']['protocol_sha256']:raise ValueError('PROTOCOL_CHANGED')
    output.mkdir(exist_ok=False)
    try:
        with _offline_scope():
            module=load_generator_functions(generator_bytes,original_bytes,
                corrected_sha256=meta['corrected_generator_sha256'],original_sha256=meta['original_generator_source_sha256'])
            if module.ORIGINAL_SOURCE_SHA256!=meta['original_generator_source_sha256']:raise ValueError('GENERATOR_CHANGED')
            from training.regression_preprocessing import prepare_regression_data
            imported=import_official_forms_csv(io.StringIO(raw.decode('utf-8-sig')));data=prepare_regression_data(imported.records)
            if len(data.y)!=36:raise ValueError('POPULATION_MISMATCH')
            model,selection=fit_candidate(data,module.generate)
            second,repeated=fit_candidate(data,module.generate)
            if (selection!=repeated or not np.array_equal(model.named_steps['regressor'].coef_,second.named_steps['regressor'].coef_)
                    or model.named_steps['regressor'].intercept_!=second.named_steps['regressor'].intercept_):
                raise ValueError('NONREPRODUCIBLE_TRAINING')
            h=save_private_pipeline(model,InferenceContract('esbeu-context-regression/1','ridge',ALLOWED_PREDICTORS),output/'context_regressor.private.joblib')
        from app.main import context_schema
        _write(output/'input-schema.json',context_schema())
        if (digest(_read(source,MAX_INPUT_BYTES))!=digest(raw)
                or digest(_read(experiment_dir/'generator.py',MAX_INPUT_BYTES))!=digest(generator_bytes)
                or digest(_read(original_path,MAX_INPUT_BYTES))!=digest(original_bytes)):
            raise ValueError('INPUT_OR_CODE_CHANGED')
        m=dict(artifact_kind='experimental-ridge-dimensional-time/1',status='completed',experimental=True,independent_validation=False,
            model_name='ridge',dataset_version=VERSION,model_sha256=h,real_records=36,synthetic_records=100,real_weight=1.,synthetic_weight=.25,
            predictors=list(ALLOWED_PREDICTORS),alpha=selection['alpha'],generator=dict(version=module.VERSION,reserve_hours_week=21,seed=42,source_sha256=digest(generator_bytes)),
            libraries=runtime_versions(),runtime=runtime,input_sha256=digest(raw),reference_report_sha256=digest(reference),
            reference_metrics_scope='posthoc_external_experiment_not_final_model_validation',reference_metrics=json.loads(reference)['arms']['corrected']['summary'],
            selection=selection,selection_protocol=dict(inner_splits=3,random_state=42,synthetic_seeds='SeedSequence([42,0,0,j+1])',primary='mae',ties=['rmse','grid_order']),
            preprocessing=dict(numeric='StandardScaler unweighted on training mixture',nominal='fixed schema one-hot',not_applicable='separate one-hot category',missing='reject',out_of_range='reject',learned_feature_order=model.named_steps['preprocess'].get_feature_names_out().tolist()),
            training_source_sha256=digest(Path(__file__).read_bytes()),created_utc=datetime.now(timezone.utc).isoformat(),reproducible_refit_verified=True,
            artifact_sha256={p.name:digest(p.read_bytes()) for p in output.iterdir()})
        _write(output/'ridge-candidate-manifest.private.json',m);_private_permissions([output,*output.iterdir()]);return m
    except Exception:
        try:_write(output/'failed.json',dict(code='RIDGE_CANDIDATE_TRAINING_FAILED'))
        except Exception:pass
        raise ValueError('RIDGE_CANDIDATE_TRAINING_FAILED') from None


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('input','experiment-dir','output','private-root'):p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--trust-generator',action='store_true',help='Only for the reviewed local Python generator; hash is not proof of trust.')
    a=p.parse_args()
    try:m=train(a.input,a.experiment_dir,a.output,a.private_root,trusted_generator=a.trust_generator)
    except Exception:
        print('RIDGE_CANDIDATE_TRAINING_FAILED',file=sys.stderr);return 2
    print(json.dumps({k:m[k] for k in ('status','dataset_version','model_sha256','alpha','reproducible_refit_verified')}));return 0


if __name__=='__main__':raise SystemExit(main())
