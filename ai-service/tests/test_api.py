"""HTTP contracts tested only with generated fictitious context and models."""
from copy import deepcopy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
import pandas as pd

from app.examples import synthetic_case, synthetic_context
from app.main import create_app
from app.predictor import RegressionService
from app.settings import Settings
from training.regression_inference import InferenceContract, save_private_pipeline
from training.regression_models import MODEL_NAMES, build_regression_pipeline
from training.regression_preprocessing import ALLOWED_PREDICTORS


KEY = "artificial-test-key-with-no-real-credentials"


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get("BURNOUTSENSE_TEST_TMPDIR"))
        self.directory = Path(self.temp.name)
        model = build_regression_pipeline("dummy", ALLOWED_PREDICTORS)
        frame = pd.DataFrame([synthetic_context(), synthetic_context()], columns=ALLOWED_PREDICTORS, dtype=object)
        model.fit(frame, [1.0, 3.0])
        digest = save_private_pipeline(model, InferenceContract("esbeu-context-regression/1", "dummy", ALLOWED_PREDICTORS),
                                       self.directory / "context_regressor.private.joblib")
        self.write("run-manifest.private.json", {"status": "completed", "data_origin": "real_questionnaire",
                   "model_name": "dummy", "eligible_records": 2, "model_sha256": digest})
        # Fictional manifest origin exercises the production gate, not real data.
        stat = {"mean": 0.0, "std": 0.0, "valid_folds": 2, "undefined_folds": 0, "failed_folds": 0}
        def row(name):
            return {"name": name, **{key: deepcopy(stat) for key in ("mae", "rmse", "r2")}}
        self.write("comparison.aggregate.json", {"failure": None, "final_candidate": {"name": "dummy"},
                   "family_comparisons": [row(name) for name in MODEL_NAMES], "selection_procedure": row("inner_selection_procedure")})
        self.write("protocol.private.json", {"protocol": {"outer_splits": 2, "inner_splits": 2, "outer_repeats": 1, "random_state": 42}})
        self.settings = Settings(model_dir=self.directory, dataset_version="artificial-api-test", trust_local_model=True, api_key=KEY)
        self.service = RegressionService(self.settings)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(self.settings, self.service)),
                                       base_url="http://test", headers={"X-API-Key": KEY})

    def write(self, name, value):
        (self.directory / name).write_text(json.dumps(value), encoding="utf-8")

    async def asyncTearDown(self):
        await self.client.aclose()
        self.temp.cleanup()

    async def test_health_and_authentication(self):
        self.assertEqual((await self.client.get("/health", headers={"X-API-Key": ""})).status_code, 200)
        self.assertEqual((await self.client.get("/v1/model", headers={"X-API-Key": "wrong"})).status_code, 401)
        self.assertEqual((await self.client.get("/ready")).status_code, 200)

    async def test_schema_and_artificial_examples(self):
        schema = (await self.client.get("/v1/schema")).json()
        self.assertEqual(len(schema["context"]["required"]), 22)
        self.assertEqual(len(schema["items"]["required"]), 14)
        examples = (await self.client.get("/v1/examples")).json()
        self.assertEqual(examples["data_origin"], "synthetic_schema_examples")
        self.assertEqual((await self.client.post("/v1/context/validate", json=examples["prediction_request"])).status_code, 200)

    async def test_prediction_only_context(self):
        response = await self.client.post("/v1/predict", json={"context": synthetic_context()})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["esbeu_overall"], 2.0)
        self.assertEqual(response.json()["kind"], "estimated_score")
        self.assertNotIn("confidence", response.json())
        self.assertEqual(response.headers["cache-control"], "no-store")

    async def test_observed_and_comparison(self):
        observed = await self.client.post("/v1/esbeu/score", json={"items": synthetic_case()["items"]})
        self.assertEqual(observed.status_code, 200, observed.text)
        self.assertEqual(observed.json()["overall"], 2)
        self.assertEqual(observed.json()["kind"], "observed_score")
        comparison = await self.client.post("/v1/validation/compare", json=synthetic_case())
        self.assertEqual(comparison.status_code, 200, comparison.text)
        self.assertEqual(comparison.json()["absolute_error"], 0)

    async def test_evaluation_is_not_cv_and_singleton_r2_is_null(self):
        response = await self.client.post("/v1/validation/evaluate", json={"cases": [synthetic_case()]})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["scope"], "caller_examples_not_cross_validation")
        self.assertIsNone(response.json()["metrics"]["r2"])
        self.assertEqual(response.json()["metrics"]["r2_undefined_reason"], "test_size_lt_2")

    async def test_batch_metrics_match_known_artificial_errors(self):
        cases = [synthetic_case(), synthetic_case()]
        cases[0]["items"] = {key: 0 for key in cases[0]["items"]}
        cases[1]["items"] = {key: 4 for key in cases[1]["items"]}
        response = await self.client.post("/v1/validation/evaluate", json={"cases": cases})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["metrics"]["mae"], 2)
        self.assertEqual(response.json()["metrics"]["rmse"], 2)
        self.assertEqual(response.json()["metrics"]["r2"], 0)

    async def test_safe_metadata_and_cv_metrics(self):
        for endpoint in ("/v1/model", "/v1/validation/metrics"):
            response = await self.client.get(endpoint)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertNotIn(str(self.directory), response.text)
            self.assertNotIn("model_sha256", response.text)
        self.assertEqual((await self.client.get("/v1/validation/metrics")).json()["metric_contract"]["mae"]["mathematical_ideal"], 0)

    async def test_rejects_scale_items_as_predictors_and_admin_fields(self):
        for key in ("esbeu_01", "email", "id"):
            context = synthetic_context()
            context[key] = "artificial-private-marker"
            response = await self.client.post("/v1/predict", json={"context": context})
            self.assertEqual(response.status_code, 422)
            self.assertNotIn("artificial-private-marker", response.text)

    async def test_strict_values_missing_and_unknown_categories(self):
        for value in (True, "7.5", None, -1):
            context = synthetic_context()
            context["sleep_hours"] = value
            self.assertEqual((await self.client.post("/v1/context/validate", json={"context": context})).status_code, 422)
        context = synthetic_context()
        context.pop("sleep_hours")
        self.assertEqual((await self.client.post("/v1/context/validate", json={"context": context})).status_code, 422)
        context = synthetic_context()
        context["course_area"] = "unrecognized artificial category"
        self.assertEqual((await self.client.post("/v1/context/validate", json={"context": context})).status_code, 422)

    async def test_inconsistent_non_working_context(self):
        context = synthetic_context()
        context["work_hours_week"] = 8
        self.assertEqual((await self.client.post("/v1/context/validate", json={"context": context})).status_code, 422)

    async def test_rejects_invalid_items(self):
        for value in (True, "2", 2.5, 5, None):
            items = synthetic_case()["items"]
            items["esbeu_01"] = value
            self.assertEqual((await self.client.post("/v1/esbeu/score", json={"items": items})).status_code, 422)

    async def test_sanitizes_pydantic_errors(self):
        response = await self.client.post("/v1/predict", json={"context": "artificial-private-marker"})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("artificial-private-marker", response.text)

    async def test_batch_limits(self):
        for cases in ([], [synthetic_case()] * 101):
            self.assertEqual((await self.client.post("/v1/validation/evaluate", json={"cases": cases})).status_code, 422)

    async def test_old_endpoints_are_absent(self):
        for endpoint in ("/predict", "/model-info", "/model-metrics", "/train", "/upload"):
            self.assertEqual((await self.client.get(endpoint)).status_code, 404)

    async def test_integrity_failure_is_sanitized(self):
        (self.directory / "context_regressor.private.joblib").write_bytes(b"not-a-model")
        response = await self.client.get("/v1/model")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn(str(self.directory), response.text)

    async def test_untrusted_model_is_not_loaded(self):
        self.service.settings = Settings(model_dir=self.directory, trust_local_model=False, api_key=KEY)
        with patch("app.predictor.load_private_pipeline") as loader:
            self.assertEqual((await self.client.get("/v1/model")).status_code, 503)
            loader.assert_not_called()

    async def test_outside_domain_rejected_without_clipping(self):
        with patch("app.predictor.predict_context_scores", side_effect=ValueError("artificial-private-marker")):
            response = await self.client.post("/v1/predict", json={"context": synthetic_context()})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["detail"]["code"], "ESTIMATE_OUTSIDE_DOMAIN")
            self.assertNotIn("artificial-private-marker", response.text)

    async def test_size_limit(self):
        response = await self.client.post("/v1/predict", content=" " * 262145)
        self.assertEqual(response.status_code, 413)

    async def test_chunked_body_limit_without_length_header(self):
        async def chunks():
            yield b" " * 140000
            yield b" " * 140000
        response = await self.client.post("/v1/predict", content=chunks())
        self.assertEqual(response.status_code, 413)

    async def test_missing_key_configuration_fails_closed(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(Settings())), base_url="http://test") as client:
            response = await client.get("/v1/schema")
            self.assertEqual(response.status_code, 503)

    async def test_malformed_private_report_fails_without_exposure(self):
        self.write("comparison.aggregate.json", {"private": "artificial-private-marker"})
        response = await self.client.get("/v1/model")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("artificial-private-marker", response.text)


if __name__ == "__main__":
    unittest.main()
