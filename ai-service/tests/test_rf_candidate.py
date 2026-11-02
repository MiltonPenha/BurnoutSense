"""Software fixtures only; no participant CSV or real model is used here."""
from copy import deepcopy
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import httpx
import numpy as np
import pandas as pd

from app.examples import synthetic_context
from app.main import create_app, context_schema
from app.experimental import ExperimentalRegressionService
from app.predictor import ModelUnavailable
from app.settings import Settings
from training.train_rf_candidate import fit_candidate
from training.regression_preprocessing import ALLOWED_PREDICTORS, RegressionData
from training.regression_inference import InferenceContract, save_private_pipeline


def fixture():
    rows=[]
    for i in range(18):
        row=synthetic_context()
        row.update(teacher_difficulties=i%5, financial_concern=(i*3)%5,
            sleep_hours=5+(i%5)*.5, subject_count=3+i%4)
        rows.append(row)
    return RegressionData(pd.DataFrame(rows,columns=ALLOWED_PREDICTORS,dtype=object),
        pd.Series([1+(i%9)/4 for i in range(18)],dtype=float), ALLOWED_PREDICTORS)


def bundle(directory):
    data=fixture();model,chosen,scores=fit_candidate(data)
    h=save_private_pipeline(model,InferenceContract('esbeu-context-regression/1','random_forest',ALLOWED_PREDICTORS),
        directory/'context_regressor.private.joblib')
    stat=dict(mean=.4,std=.1,valid_folds=15,undefined_folds=0,failed_folds=0)
    row=lambda name: dict(name=name,**{k:stat for k in ('mae','rmse','r2')})
    (directory/'v2-reference.aggregate.json').write_text(json.dumps(dict(
        family_comparisons=[row(n) for n in ('dummy','ridge','random_forest','svr')],
        selection_procedure=row('inner_selection_procedure'))))
    (directory/'input-schema.json').write_text(json.dumps(context_schema()))
    m=dict(artifact_kind='experimental-rf-a/1',status='completed',experimental=True,
        independent_validation=False,data_origin='real_questionnaire',eligible_records=len(data.y),
        dataset_version='rf-a-candidate-test',model_name='random_forest',model_sha256=h,
        chosen_candidate=asdict(chosen),protocol=dict(outer_splits=5,inner_splits=3,outer_repeats=3,random_state=42),
        artifact_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir()})
    (directory/'candidate-manifest.private.json').write_text(json.dumps(m))
    return data,model,chosen,scores


class CandidateTests(unittest.TestCase):
    def test_training_reproducibility(self):
        data=fixture();a,ca,sa=fit_candidate(data);b,cb,sb=fit_candidate(data)
        self.assertEqual(ca,cb);self.assertEqual(sa,sb)
        np.testing.assert_array_equal(a.predict(data.X),b.predict(data.X))

    def test_excludes_outcome_and_requires_all_context(self):
        data=fixture();data.X['esbeu_01']=2
        with self.assertRaises(ValueError):fit_candidate(data)

    def test_load_matches_persisted_pipeline(self):
        with tempfile.TemporaryDirectory() as name:
            d=Path(name);data,model,_,_=bundle(d)
            svc=ExperimentalRegressionService(Settings(d,'rf-a-candidate-test',True,'test-key',True))
            result=svc.predict(synthetic_context())
            self.assertTrue(result['experimental']);self.assertGreaterEqual(result['esbeu_overall'],0)
            self.assertLessEqual(result['esbeu_overall'],4)
            expected=model.predict(svc.context_frame(synthetic_context()))[0]
            self.assertEqual(result['esbeu_overall'],expected)

    def test_corrupted_artifact_and_failed_run_rejected(self):
        with tempfile.TemporaryDirectory() as name:
            d=Path(name);bundle(d)
            settings=Settings(d,'rf-a-candidate-test',True,'test-key',True)
            (d/'failed.json').write_text('{}')
            with self.assertRaises(ModelUnavailable):ExperimentalRegressionService(settings).info()
        with tempfile.TemporaryDirectory() as name:
            d=Path(name);bundle(d)
            settings=Settings(d,'rf-a-candidate-test',True,'test-key',True)
            (d/'context_regressor.private.joblib').write_bytes(b'not a trusted model')
            with self.assertRaises(ModelUnavailable):ExperimentalRegressionService(settings).info()


class CandidateHttpTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_contract_and_invalid_inputs(self):
        with tempfile.TemporaryDirectory() as name:
            d=Path(name);bundle(d)
            config=Settings(d,'rf-a-candidate-test',True,'artificial-test-key-at-least-24',True)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(config)),
                    base_url='http://test',headers={'X-API-Key':config.api_key}) as client:
                r=await client.post('/v1/predict',json={'context':synthetic_context()})
                self.assertEqual(r.status_code,200);self.assertTrue(r.json()['experimental'])
                self.assertTrue(r.json()['model_version'].startswith('sha256:'))
                self.assertEqual((await client.get('/v1/validation/metrics')).json()['scope'],
                    'exploratory_v2_reference_not_candidate_validation')
                self.assertEqual((await client.get('/v1/model')).json()['validation_scope'],'exploratory_post_selection')
                for mutate in ('missing','category','logic','extra','null','nonfinite','boolean'):
                    c=deepcopy(synthetic_context())
                    if mutate=='missing':c.pop('teacher_difficulties')
                    elif mutate=='category':c['employment']='PRIVATE_SENTINEL'
                    elif mutate=='logic':c['work_hours_week']=8
                    elif mutate=='extra':c['esbeu_01']=2
                    elif mutate=='null':c['sleep_hours']=None
                    elif mutate=='nonfinite':c['sleep_hours']='NaN'
                    else:c['sleep_hours']=True
                    bad=await client.post('/v1/predict',json={'context':c})
                    self.assertEqual(bad.status_code,422);self.assertNotIn('PRIVATE_SENTINEL',bad.text)
                self.assertEqual((await client.post('/v1/predict',json={'context':synthetic_context()},
                    headers={'X-API-Key':'wrong'})).status_code,401)
