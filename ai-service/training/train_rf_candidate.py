"""Local experimental RF/A refit; no new optimization grid or external CV."""
import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

from sklearn.model_selection import KFold

from training.optimization_v2 import default_candidates, _tune, _rank
from training.regression_inference import InferenceContract, save_private_pipeline
from training.regression_models import build_regression_pipeline
from training.regression_preprocessing import ALLOWED_PREDICTORS
from training.run_local_optimization_v2 import _load, inspect_bytes, PRIVATE_ROOT, CONTROLLED_INPUT
from training.run_private_optimization_v2 import _offline_scope, _private_permissions, _write, _read, MAX_INPUT_BYTES, describe_runtime
from training.private_v2_contracts import validate_paths

GRID = tuple(c for c in default_candidates() if c.subset == 'A' and c.model.name == 'random_forest')
DATASET_VERSION = 'rf-a-candidate-v1'


def fit_candidate(data):
    """3-fold shuffled CV seed 42, then full refit; scores are tuning, not validation."""
    if tuple(data.X.columns) != ALLOWED_PREDICTORS or data.predictors != ALLOWED_PREDICTORS:
        raise ValueError('INVALID_CONTEXT_SCHEMA')
    inner = tuple(KFold(3, shuffle=True, random_state=42).split(data.X))
    scores = _tune(GRID, data.X, data.y, inner, 42)
    if any(s['failed_folds'] or s['warning_codes'] for s in scores):
        raise ValueError('INTERNAL_SELECTION_FAILED')
    index = min(range(len(GRID)), key=lambda i: _rank(i, scores, GRID))
    chosen = GRID[index].model
    model = build_regression_pipeline('random_forest', ALLOWED_PREDICTORS,
        random_state=42, model_params=dict(chosen.parameters))
    model.fit(data.X.copy(deep=True), data.y.copy(deep=True))
    return model, chosen, scores


def train(output):
    output = Path(output)
    validate_paths(CONTROLLED_INPUT, output, repository=Path(__file__).resolve().parents[2], private_root=PRIVATE_ROOT)
    _private_permissions([output.parent])
    runtime, payload = _load()
    reference_dir = PRIVATE_ROOT / 'runs/local-v2-evaluation-20261102-01'
    prior = json.loads((reference_dir / 'manifest.json').read_bytes())
    reference = (reference_dir / 'report.aggregate.json').read_bytes()
    if (hashlib.sha256(reference).hexdigest() != prior['artifact_sha256']['report.aggregate.json']
            or hashlib.sha256(payload).hexdigest() != prior['input_sha256']
            or any(runtime[k] != prior['runtime'][k] for k in ('code_sha256', 'environment_sha256', 'protocol_sha256', 'git_commit'))):
        raise ValueError('REFERENCE_PROVENANCE_MISMATCH')
    source_hashes = {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in (
        'training/train_rf_candidate.py', 'training/run_local_optimization_v2.py',
        'training/regression_inference.py', 'app/experimental.py')}
    output.mkdir(exist_ok=False)
    try:
        with _offline_scope():
            inspection, data = inspect_bytes(payload)
            if len(data.y) != 36 or not inspection['computationally_adequate']:
                raise ValueError('INVALID_POPULATION')
            model, chosen, scores = fit_candidate(data)
            digest = save_private_pipeline(model, InferenceContract('esbeu-context-regression/1',
                'random_forest', ALLOWED_PREDICTORS), output / 'context_regressor.private.joblib')
        ref = json.loads(reference)
        metrics = dict(family_comparisons=[dict(name=name, **ref['comparisons']['A/'+name]['summary'])
            for name in ('dummy', 'ridge', 'random_forest', 'svr')],
            selection_procedure=dict(name='inner_selection_procedure', **ref['selection']['summary']))
        _write(output / 'v2-reference.aggregate.json', metrics)
        _write(output / 'input-schema.json', __import__('app.main', fromlist=['context_schema']).context_schema())
        if (describe_runtime() != runtime
                or hashlib.sha256(_read(CONTROLLED_INPUT, MAX_INPUT_BYTES)).hexdigest() != prior['input_sha256']
                or any(hashlib.sha256(Path(p).read_bytes()).hexdigest() != h for p,h in source_hashes.items())):
            raise ValueError('PROVENANCE_CHANGED')
        manifest = dict(artifact_kind='experimental-rf-a/1', status='completed', experimental=True,
            independent_validation=False, data_origin='real_questionnaire', eligible_records=36,
            dataset_version=DATASET_VERSION, model_name='random_forest', model_sha256=digest,
            chosen_candidate=asdict(chosen), internal_selection_scores=scores,
            selection_protocol=dict(inner_splits=3, shuffle=True, random_state=42,
                primary='mae', ties=['rmse','catalog_order'], scope='full_training_set_only'),
            protocol=ref['protocol'], created_utc=datetime.now(timezone.utc).isoformat(), runtime=runtime,
            input_sha256=prior['input_sha256'], reference_report_sha256=hashlib.sha256(reference).hexdigest(),
            source_sha256=source_hashes, os_network_isolated=False,
            artifact_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in output.iterdir()})
        _write(output / 'candidate-manifest.private.json', manifest)
        _private_permissions([output, *output.iterdir()])
        return manifest
    except Exception:
        try:
            _write(output / 'failed.json', dict(code='CANDIDATE_TRAINING_FAILED'))
        except Exception:
            pass
        raise ValueError('CANDIDATE_TRAINING_FAILED') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        m = train(args.output)
    except Exception:
        print('CANDIDATE_TRAINING_FAILED', file=sys.stderr)
        return 2
    print(json.dumps({k:m[k] for k in ('status','dataset_version','model_name','model_sha256','chosen_candidate')}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
