"""Fictional fixtures only; no participant CSV or private real model in unit tests."""
from copy import deepcopy
from dataclasses import replace
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
import numpy as np

from app.examples import synthetic_context
from app.experimental import ExperimentalRegressionService
from app.main import create_app, context_schema
from app.predictor import ModelUnavailable, EstimateRejected, InputRejected
from app.settings import Settings
from app.shadow_ridge import ShadowRidgeService
from training.form_schema import ELIGIBILITY_FIELDS, ESBEU_FIELDS
from training.regression_inference import InferenceContract, save_private_pipeline, runtime_versions
from training.regression_preprocessing import ALLOWED_PREDICTORS
from training.train_ridge_candidate import fit_candidate, load_generator_functions
from test_rf_candidate import fixture, bundle as rf_bundle

KEY='fictional-shadow-test-key-at-least-24'


def synthetic_generator(seed,avoid=()):
    rng=np.random.default_rng(seed);rows=[]
    for i in range(100):
        row={f.identifier:f.choices[0] for f in ELIGIBILITY_FIELDS};row.update(synthetic_context())
        row.update(teacher_difficulties=int(rng.integers(5)),financial_concern=int(rng.integers(5)),sleep_hours=float(rng.uniform(5,8)))
        row.update({f.identifier:int(rng.integers(5)) for f in ESBEU_FIELDS});rows.append(row)
    return rows,dict(reserve_hours_week=21,accepted=100)


def ridge_bundle(d):
    model,selection=fit_candidate(fixture(),synthetic_generator)
    h=save_private_pipeline(model,InferenceContract('esbeu-context-regression/1','ridge',ALLOWED_PREDICTORS),d/'context_regressor.private.joblib')
    (d/'input-schema.json').write_text(json.dumps(context_schema()),encoding='utf-8')
    manifest=dict(artifact_kind='experimental-ridge-dimensional-time/1',status='completed',experimental=True,independent_validation=False,
        model_name='ridge',model_sha256=h,real_records=18,synthetic_records=100,real_weight=1.,synthetic_weight=.25,
        generator=dict(version='dimensional-weekly-budget/2',reserve_hours_week=21),alpha=selection['alpha'],libraries=runtime_versions(),
        predictors=list(ALLOWED_PREDICTORS),dataset_version='ridge-dimensional-time-candidate-test',
        artifact_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in d.iterdir()})
    (d/'ridge-candidate-manifest.private.json').write_text(json.dumps(manifest),encoding='utf-8')
    return model,h


class RidgeTrainingTests(unittest.TestCase):
    def test_function_loader_ignores_unrelated_top_level_imports(self):
        original=b"import module_that_does_not_exist\nraise RuntimeError('must not execute')\ndef generate(seed,avoid=()):\n return seed+len(avoid)\n"
        corrected=b"VERSION='dimensional-weekly-budget/2'\nRESERVE_HOURS_WEEK=21.\nraise RuntimeError('must not execute')\ndef weekly_hours(record):\n return 7*record['sleep_hours']\ndef generate(seed,avoid=(),reserve_hours=RESERVE_HOURS_WEEK):\n return ORIGINAL['generate'](seed,avoid),reserve_hours\n"
        loaded=load_generator_functions(corrected,original,corrected_sha256=hashlib.sha256(corrected).hexdigest(),original_sha256=hashlib.sha256(original).hexdigest())
        self.assertEqual(loaded.generate(42,('fixture',)),(43,21.))

    def test_function_loader_rejects_hash_mismatch(self):
        with self.assertRaises(ValueError):
            load_generator_functions(b'raise RuntimeError()',b'',corrected_sha256='0'*64,original_sha256='0'*64)

    def test_function_loader_requires_complete_unique_definitions(self):
        original=b'def generate(seed,avoid=()):\n return seed\ndef generate(seed,avoid=()):\n return seed\n'
        corrected=b"VERSION='dimensional-weekly-budget/2'\nRESERVE_HOURS_WEEK=21.\n"
        with self.assertRaises(ValueError):
            load_generator_functions(corrected,original,corrected_sha256=hashlib.sha256(corrected).hexdigest(),original_sha256=hashlib.sha256(original).hexdigest())

    def test_reproducible_refit_and_grid(self):
        a,sa=fit_candidate(fixture(),synthetic_generator);b,sb=fit_candidate(fixture(),synthetic_generator)
        self.assertEqual(sa,sb);self.assertIn(sa['alpha'],(1.,10.))
        np.testing.assert_array_equal(a.predict(fixture().X),b.predict(fixture().X))

    def test_generator_receives_only_inner_training_then_final(self):
        sizes=[]
        def spy(seed,avoid):sizes.append(len(avoid));return synthetic_generator(seed,avoid)
        fit_candidate(fixture(),spy)
        self.assertEqual(sizes,[12,12,12,18])

    def test_no_outcome_predictor_allowed(self):
        data=fixture();data.X['esbeu_01']=2
        with self.assertRaises(ValueError):fit_candidate(data,synthetic_generator)

    def test_generator_volume_checked(self):
        def short(seed,avoid):r,m=synthetic_generator(seed,avoid);return r[:99],m
        with self.assertRaises(ValueError):fit_candidate(fixture(),short)


class ShadowLoaderTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.d=Path(self.tmp.name);self.model,self.h=ridge_bundle(self.d)
        self.config=Settings(shadow_ridge_enabled=True,shadow_ridge_dir=self.d,shadow_ridge_sha256=self.h,trust_shadow_ridge=True,environment='test')
    def tearDown(self):self.tmp.cleanup()

    def test_load_and_order_match_direct_pipeline(self):
        svc=ShadowRidgeService(self.config);c=dict(reversed(list(synthetic_context().items())))
        result=svc.predict(c);self.assertEqual(result['model_name'],'ridge');self.assertTrue(result['experimental'])
        self.assertEqual(result['esbeu_overall'],self.model.predict(svc.context_frame(c))[0])
        self.assertEqual(tuple(svc.context_frame(c).columns),ALLOWED_PREDICTORS)

    def test_na_preserved_and_invalid_inputs_rejected(self):
        svc=ShadowRidgeService(self.config);svc.predict(synthetic_context())
        for kind in ('missing','extra','invalid','none','boolean'):
            c=synthetic_context()
            if kind=='missing':c.pop('sleep_hours')
            elif kind=='extra':c['esbeu_01']=2
            elif kind=='invalid':c['sleep_quality']=9
            elif kind=='none':c['sleep_hours']=None
            else:c['sleep_hours']=True
            with self.subTest(kind=kind),self.assertRaises(InputRejected):svc.predict(c)

    def test_explicit_gates(self):
        for changes in (dict(shadow_ridge_enabled=False),dict(environment='production'),dict(trust_shadow_ridge=False),dict(shadow_ridge_sha256='')):
            with self.subTest(changes=changes),self.assertRaises(ModelUnavailable):ShadowRidgeService(replace(self.config,**changes)).predict(synthetic_context())

    def test_hash_failure_prevents_unpickle(self):
        (self.d/'context_regressor.private.joblib').write_bytes(b'fictional-corruption')
        with patch('app.shadow_ridge.load_private_pipeline') as loader:
            with self.assertRaises(ModelUnavailable):ShadowRidgeService(self.config).predict(synthetic_context())
            loader.assert_not_called()

    def test_manifest_model_and_schema_checked(self):
        for key,value in [('model_name','random_forest'),('alpha',999),('synthetic_weight',True),('predictors',list(reversed(ALLOWED_PREDICTORS)))]:
            path=self.d/'ridge-candidate-manifest.private.json';old=path.read_text();m=json.loads(old);m[key]=value;path.write_text(json.dumps(m))
            with self.subTest(key=key),self.assertRaises(ModelUnavailable):ShadowRidgeService(self.config).predict(synthetic_context())
            path.write_text(old)

    def test_out_of_range_rejected_without_clipping(self):
        svc=ShadowRidgeService(self.config);svc._load()
        for value in (-.01,4.01,float('nan'),float('inf')):
            with self.subTest(value=value),patch.object(svc._artifact['pipeline'],'predict',return_value=np.array([value])):
                with self.assertRaises(EstimateRejected):svc.predict(synthetic_context())

    def test_settings_default_off(self):
        with patch.dict(os.environ,{},clear=True):
            s=Settings.from_environment();self.assertFalse(s.shadow_ridge_enabled);self.assertFalse(s.trust_shadow_ridge);self.assertEqual(s.environment,'production')


class ShadowHttpTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory();root=Path(self.tmp.name);self.rf=root/'rf';self.ridge=root/'ridge';self.rf.mkdir();self.ridge.mkdir()
        rf_bundle(self.rf);_,h=ridge_bundle(self.ridge)
        self.config=Settings(self.rf,'rf-a-candidate-test',True,KEY,True,True,self.ridge,h,True,'test')
    async def asyncTearDown(self):self.tmp.cleanup()
    def client(self,config=None,shadow=None,host='127.0.0.1'):
        app=create_app(config or self.config,shadow_service=shadow)
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app,client=(host,123)),base_url='http://local',headers={'X-API-Key':KEY})

    async def test_official_unchanged_and_two_versions(self):
        async with self.client() as c:
            body={'context':synthetic_context()};official=(await c.post('/v1/predict',json=body)).json()
            r=await c.post('/v1/experimental/shadow/predict',json=body)
            self.assertEqual(r.status_code,200);s=r.json();self.assertEqual(s['official'],official)
            self.assertEqual(s['candidate']['model_name'],'ridge');self.assertEqual(s['shadow_status'],'available')
            self.assertNotEqual(s['official']['model_version'],s['candidate']['model_version'])
            self.assertNotIn('candidate',official);self.assertEqual(r.headers['cache-control'],'no-store')
            self.assertEqual((await c.get('/ready')).status_code,200)

    async def test_default_and_production_route_absent(self):
        for config in (replace(self.config,shadow_ridge_enabled=False),replace(self.config,environment='production')):
            async with self.client(config) as c:
                self.assertEqual((await c.post('/v1/experimental/shadow/predict',json={'context':synthetic_context()})).status_code,404)
                self.assertEqual((await c.post('/v1/predict',json={'context':synthetic_context()})).status_code,200)

    async def test_missing_ridge_does_not_affect_rf(self):
        async with self.client(replace(self.config,shadow_ridge_dir=self.ridge/'absent')) as c:
            r=await c.post('/v1/experimental/shadow/predict',json={'context':synthetic_context()})
            self.assertEqual(r.status_code,200);self.assertEqual(r.json()['shadow_status'],'unavailable')
            self.assertIsNone(r.json()['candidate']);self.assertEqual(r.json()['official']['model_name'],'random_forest')
            self.assertEqual((await c.post('/v1/predict',json={'context':synthetic_context()})).status_code,200)

    async def test_unexpected_ridge_failure_sanitized(self):
        class Broken:
            def predict(self,c):raise RuntimeError('PRIVATE_RESPONSE_SENTINEL')
        async with self.client(shadow=Broken()) as c:
            r=await c.post('/v1/experimental/shadow/predict',json={'context':synthetic_context()})
            self.assertEqual(r.json()['shadow_status'],'unavailable');self.assertNotIn('PRIVATE_RESPONSE_SENTINEL',r.text)

    async def test_rejected_ridge_keeps_official_score(self):
        class Outside:
            def predict(self,c):raise EstimateRejected('do not log')
        async with self.client(shadow=Outside()) as c:
            r=await c.post('/v1/experimental/shadow/predict',json={'context':synthetic_context()})
            self.assertEqual(r.status_code,200);self.assertEqual(r.json()['shadow_status'],'rejected')
            self.assertEqual(r.json()['official']['model_name'],'random_forest')

    async def test_auth_remote_and_spoofed_forwarded_header(self):
        async with self.client(host='203.0.113.10') as c:
            self.assertEqual((await c.post('/v1/experimental/shadow/predict',json={'context':synthetic_context()},headers={'X-Forwarded-For':'127.0.0.1'})).status_code,403)
        async with self.client() as c:
            self.assertEqual((await c.post('/v1/experimental/shadow/predict',json={'context':synthetic_context()},headers={'X-API-Key':'wrong'})).status_code,401)

    async def test_invalid_context_cannot_reach_ridge(self):
        class Never:
            def predict(self,c):raise AssertionError('must not run')
        async with self.client(shadow=Never()) as c:
            ctx=synthetic_context();ctx['esbeu_01']=2
            r=await c.post('/v1/experimental/shadow/predict',json={'context':ctx})
            self.assertEqual(r.status_code,422)


if __name__=='__main__':unittest.main()
