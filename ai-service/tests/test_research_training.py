"""Entire workflow tested with generated fictitious records, never research data."""

from contextlib import redirect_stderr, redirect_stdout
import csv
from dataclasses import asdict, replace
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from sklearn.model_selection import KFold

from training.form_schema import ANALYTICAL_FIELDS, FIELDS_BY_ID, SpecialValue
from training.import_forms import import_official_forms_csv, official_header_mapping
from training.regression_evaluation import RegressionMetrics
from training.regression_experiments import (
    Candidate, ExperimentError, ExperimentProtocol, TuningScore, default_candidates,
    run_nested_experiments,
)
from training.regression_inference import (
    InferenceContract, InferenceError, load_private_pipeline, predict_context_scores,
    save_private_pipeline,
)
from training.regression_models import MODEL_NAMES, build_regression_pipeline
from training.regression_preprocessing import prepare_regression_data
from training.research_audit import audit_import
from training.run_research_training import REPOSITORY, TrainingRunError, main, run_local_training


PREDICTORS = ("sleep_hours", "course_area", "study_work_difficulty")
PROTOCOL = ExperimentProtocol(outer_splits=2, inner_splits=2, outer_repeats=1)
COMPACT = tuple(Candidate(name) for name in MODEL_NAMES)


def temporary_directory():
    # Restricted Windows environments may need an explicitly writable temp root.
    return tempfile.TemporaryDirectory(dir=os.environ.get("BURNOUTSENSE_TEST_TMPDIR"))


def records(count=12):
    result = []
    for number in range(count):
        record = {f.identifier: f.choices[0] if f.choices else f.minimum for f in ANALYTICAL_FIELDS}
        record["sleep_hours"] = 1 + number / 2
        record["course_area"] = FIELDS_BY_ID["course_area"].choices[number % 7]
        record["study_work_difficulty"] = SpecialValue.NOT_APPLICABLE if number % 3 == 0 else number % 5
        for index in range(1, 15):
            record[f"esbeu_{index:02d}"] = (number + (index == 1)) % 5
        result.append(record)
    return result


def official_stream(source_records):
    mapping = official_header_mapping()
    headers = ["Carimbo de data/hora", *mapping, "E-mail para recebimento da cópia do TCLE"]
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(headers)
    for record in source_records:
        values = []
        for header in headers:
            value = record[mapping[header]] if header in mapping else "synthetic-excluded"
            values.append(value.value if value is SpecialValue.NOT_APPLICABLE else value)
        writer.writerow(values)
    stream.seek(0)
    return stream


def configuration(source, output):
    return {
        "institutional_ethics_authorized": True,
        "training_consent_confirmed": True,
        "one_independent_response_per_participant": True,
        "authorization_reference": "synthetic-test-only-not-an-actual-authorization",
        "data_origin": "synthetic_test",
        "csv_path": str(source), "output_directory": str(output),
        "predictors": list(PREDICTORS), "protocol": asdict(PROTOCOL),
    }


class ResearchAuditTests(unittest.TestCase):
    def test_aggregate_only_and_schema_width_without_fit(self):
        imported = import_official_forms_csv(official_stream(records()))
        with patch("sklearn.pipeline.Pipeline.fit", side_effect=AssertionError("No audit fit")):
            result = audit_import(imported)
        self.assertEqual((result.rows_read, result.eligible, result.rejected), (12, 12, 0))
        self.assertEqual(result.transformed_columns, 40)
        self.assertNotIn("synthetic-excluded", repr(result))
        self.assertEqual(dict(result.outcome_distributions)["overall"].count, 12)
        area = next(summary for summary in result.category_coverage if summary.field == "course_area")
        self.assertEqual(area.levels_with_fewer_than_five_records, 7)
        employment = next(summary for summary in result.category_coverage if summary.field == "employment")
        self.assertEqual(employment.levels_with_fewer_than_five_records, 0)

    def test_identical_rows_counted_without_deletion(self):
        source = records(1) * 3
        result = audit_import(import_official_forms_csv(official_stream(source)))
        self.assertEqual(result.identical_analytical_rows_beyond_first, 2)
        self.assertEqual(result.eligible, 3)

    def test_ineligible_rejected_and_empty_audits(self):
        source = records(3)
        source[0]["consent"] = "Não concordo em participar."
        source[1]["sleep_hours"] = "synthetic-private"
        result = audit_import(import_official_forms_csv(official_stream(source)))
        self.assertEqual((result.eligible, result.ineligible, result.rejected), (1, 1, 1))
        self.assertEqual(result.rejected_first_issue_counts, (("sleep_hours", 1),))
        self.assertNotIn("synthetic-private", repr(result))
        empty = audit_import(import_official_forms_csv(official_stream([])))
        self.assertIsNone(dict(empty.outcome_distributions)["overall"].mean)


class NestedExperimentsTests(unittest.TestCase):
    def setUp(self):
        self.data = prepare_regression_data(records(), PREDICTORS)

    def test_default_grid_has_24_valid_predeclared_candidates(self):
        grid = default_candidates()
        self.assertEqual(len(grid), 24)
        self.assertEqual(len(set(grid)), 24)
        self.assertEqual({candidate.name for candidate in grid}, set(MODEL_NAMES))
        for candidate in grid:
            build_regression_pipeline(candidate.name, PREDICTORS, model_params=dict(candidate.parameters))

    def test_all_models_nested_metrics_final_fit_and_no_mutation(self):
        X, y = self.data.X.copy(deep=True), self.data.y.copy(deep=True)
        result = run_nested_experiments(self.data, protocol=PROTOCOL)
        self.assertIsNone(result.report.final_refit_failure)
        self.assertIsNotNone(result.fitted_model)
        self.assertEqual(len(result.report.family_folds), 10)
        self.assertEqual(len(result.report.selection_folds), 2)
        self.assertEqual(len(result.report.final_inner_scores), 24)
        self.assertEqual(tuple(s.name for s in result.report.family_summaries), MODEL_NAMES)
        self.assertTrue(all(s.mae.valid_folds == 2 for s in result.report.family_summaries))
        self.assertTrue(self.data.X.equals(X))
        self.assertTrue(self.data.y.equals(y))
        self.assertTrue(np.isfinite(result.fitted_model.predict(self.data.X)).all())
        json.dumps(asdict(result.report), allow_nan=False)

    def test_reproducibility_with_fixed_protocol(self):
        first = run_nested_experiments(self.data, protocol=PROTOCOL, candidates=COMPACT)
        second = run_nested_experiments(self.data, protocol=PROTOCOL, candidates=COMPACT)
        self.assertEqual(first.report, second.report)
        np.testing.assert_allclose(first.fitted_model.predict(self.data.X),
                                   second.fitted_model.predict(self.data.X))

    def test_inner_search_never_receives_outer_holdout(self):
        from training import regression_experiments as module
        original = module._tune
        seen = []

        def tune(candidates, X, y, partitions, seed):
            seen.append(tuple(X.index))
            for train, test in partitions:
                self.assertTrue(set(train).isdisjoint(test))
                self.assertEqual(set(train) | set(test), set(range(len(X))))
            return original(candidates, X, y, partitions, seed)

        with patch.object(module, "_tune", tune):
            run_nested_experiments(self.data, protocol=PROTOCOL, candidates=COMPACT)
        expected = tuple(KFold(2, shuffle=True, random_state=42).split(self.data.X))
        self.assertEqual(seen[0], tuple(self.data.X.iloc[expected[0][0]].index))
        self.assertEqual(seen[1], tuple(self.data.X.iloc[expected[1][0]].index))
        self.assertEqual(seen[2], tuple(self.data.X.index))  # Final tuning only after outer CV.

    def test_outer_winner_does_not_override_inner_only_selection(self):
        from training import regression_experiments as module
        scores = tuple(TuningScore(c, {"dummy": 2, "linear": 1, "ridge": 0.5,
                                      "random_forest": 0.7, "svr": 0.8}[c.name], 1, 0)
                       for c in COMPACT)

        def trial(candidate, X, y, train, test, seed):
            return RegressionMetrics(0 if candidate.name == "svr" else 1, 1, 0), None, ()

        with patch.object(module, "_tune", return_value=scores), patch.object(module, "_fit_trial", trial):
            result = run_nested_experiments(self.data, protocol=PROTOCOL, candidates=COMPACT)
        self.assertEqual(result.report.final_candidate.name, "ridge")
        self.assertTrue(all(f.name == "ridge" for f in result.report.selection_folds))
        self.assertEqual(next(s for s in result.report.family_summaries if s.name == "svr").mae.mean, 0)

    def test_failed_inner_candidates_are_visible_and_not_partially_averaged(self):
        from training import regression_experiments as module
        grid = (Candidate("ridge", (("alpha", 1.0),)), Candidate("ridge", (("alpha", 10.0),)))

        def trial(candidate, X, y, train, test, seed):
            if dict(candidate.parameters)["alpha"] == 1.0:
                return None, "not_converged", ("convergence_warning",)
            return RegressionMetrics(1, 1, 0), None, ()

        partitions = tuple(KFold(2).split(self.data.X))
        with patch.object(module, "_fit_trial", trial):
            scores = module._tune(grid, self.data.X, self.data.y, partitions, 42)
        self.assertIsNone(scores[0].mae)
        self.assertEqual(scores[0].failed_folds, 2)
        self.assertEqual(scores[0].failure_codes, ("not_converged",))
        self.assertEqual(scores[1].mae, 1)

    def test_outer_failure_blocks_final_artifact(self):
        with patch("sklearn.pipeline.Pipeline.fit", side_effect=ValueError("synthetic-private")):
            result = run_nested_experiments(self.data, protocol=PROTOCOL, candidates=COMPACT)
        self.assertIsNone(result.fitted_model)
        self.assertEqual(result.report.final_refit_failure, "outer_evaluation_incomplete")
        self.assertNotIn("synthetic-private", json.dumps(asdict(result.report), allow_nan=False))

    def test_constant_target_can_select_dummy(self):
        self.data.y[:] = 2.0
        result = run_nested_experiments(self.data, protocol=PROTOCOL, candidates=COMPACT)
        self.assertEqual(result.report.final_candidate.name, "dummy")
        self.assertTrue(all(s.r2.undefined_folds == 2 for s in result.report.family_summaries))

    def test_invalid_protocol_or_catalog_rejected_before_fit(self):
        cases = [ExperimentProtocol(outer_splits=1), ExperimentProtocol(inner_splits=1),
                 ExperimentProtocol(outer_splits=7), ExperimentProtocol(random_state=True),
                 ExperimentProtocol(outer_repeats=0)]
        with patch("sklearn.pipeline.Pipeline.fit", side_effect=AssertionError("Must not fit")):
            for protocol in cases:
                with self.assertRaises(ExperimentError):
                    run_nested_experiments(self.data, protocol=protocol)
            for catalog in ((), (Candidate("dummy"),), COMPACT + (COMPACT[0],)):
                with self.assertRaises(ExperimentError):
                    run_nested_experiments(self.data, protocol=PROTOCOL, candidates=catalog)


class InferenceTests(unittest.TestCase):
    def setUp(self):
        self.data = prepare_regression_data(records(), PREDICTORS)
        self.model = build_regression_pipeline("dummy", PREDICTORS).fit(self.data.X, self.data.y)
        self.contract = InferenceContract("esbeu-context-regression/1", "dummy", PREDICTORS)

    def test_private_persistence_roundtrip_and_domain_contract(self):
        with temporary_directory() as temporary:
            path = Path(temporary) / "test-artifact.joblib"
            checksum = save_private_pipeline(self.model, self.contract, path)
            loaded = load_private_pipeline(path, trusted=True, expected_sha256=checksum)
            prediction = predict_context_scores(loaded, self.data.X)
            np.testing.assert_allclose(prediction, self.model.predict(self.data.X))
            self.assertTrue(((prediction >= 0) & (prediction <= 4)).all())
            with self.assertRaises(InferenceError):
                save_private_pipeline(self.model, self.contract, path)

    def test_untrusted_or_wrong_hash_never_deserializes(self):
        with patch("training.regression_inference.joblib.load", side_effect=AssertionError("Must not load")):
            with self.assertRaises(InferenceError):
                load_private_pipeline(Path("synthetic-private"), expected_sha256="0" * 64)
            with temporary_directory() as temporary:
                path = Path(temporary) / "not-a-model"
                path.write_text("synthetic-private", encoding="utf-8")
                with self.assertRaises(InferenceError) as caught:
                    load_private_pipeline(path, trusted=True, expected_sha256="0" * 64)
                self.assertNotIn("synthetic-private", str(caught.exception))

    def test_invalid_contract_unfitted_model_and_no_silent_clipping(self):
        with self.assertRaises(InferenceError):
            save_private_pipeline(self.model, self.contract, REPOSITORY / "never-write-model.joblib")
        with temporary_directory() as temporary:
            path = Path(temporary) / "test.joblib"
            for contract in (replace(self.contract, model_name="ridge"),
                             replace(self.contract, output_maximum=10),
                             replace(self.contract, out_of_range_policy="clip")):
                with self.assertRaises(InferenceError):
                    save_private_pipeline(self.model, contract, path)
            with self.assertRaises(InferenceError):
                save_private_pipeline(build_regression_pipeline("dummy", PREDICTORS), self.contract, path)
        artifact = {"contract": asdict(self.contract), "pipeline": self.model}
        for value in (-0.1, 4.1, float("nan")):
            with patch.object(self.model, "predict", return_value=np.full(12, value)):
                with self.assertRaises(InferenceError):
                    predict_context_scores(artifact, self.data.X)


class LocalRunnerTests(unittest.TestCase):
    def test_missing_authorization_or_group_confirmation_never_opens_csv(self):
        base = configuration("synthetic-private", "synthetic-private")
        keys = ("institutional_ethics_authorized", "training_consent_confirmed",
                "one_independent_response_per_participant", "authorization_reference")
        with patch("training.run_research_training.import_official_forms_csv",
                   side_effect=AssertionError("Must not open")):
            for key in keys:
                config = dict(base)
                del config[key]
                with self.assertRaises(TrainingRunError):
                    run_local_training(config)

    def test_repository_paths_refused_before_import(self):
        with patch("training.run_research_training.import_official_forms_csv",
                   side_effect=AssertionError("Must not open")):
            with self.assertRaises(TrainingRunError):
                run_local_training(configuration(REPOSITORY / "private.csv", REPOSITORY / "private-model"))

    def test_entire_local_workflow_on_temporary_artificial_csv(self):
        with temporary_directory() as temporary:
            root = Path(temporary)
            source = root / "entirely-artificial.csv"
            content = official_stream(records()).getvalue()
            source.write_text(content, encoding="utf-8", newline="")
            before = source.read_bytes()
            output = root / "private-results"
            manifest = run_local_training(configuration(source, output))
            self.assertEqual(manifest["status"], "completed")
            self.assertEqual(manifest["data_origin"], "synthetic_test")
            audit = json.loads((output / "audit.private.json").read_text(encoding="utf-8"))
            self.assertEqual((audit["rows_read"], audit["eligible"], audit["rejected"]), (12, 12, 0))
            self.assertEqual(source.read_bytes(), before)
            self.assertTrue((output / "context_regressor.private.joblib").exists())
            aggregate = json.loads((output / "comparison.aggregate.json").read_text(encoding="utf-8"))
            self.assertEqual(aggregate["data_origin"], "synthetic_test")
            self.assertNotIn("family_folds", aggregate)
            self.assertNotIn("selection_folds", aggregate)
            report = json.loads((output / "experiments.private.json").read_text(encoding="utf-8"))
            self.assertEqual(len(report["final_inner_scores"]), 24)
            self.assertEqual({s["name"] for s in report["family_summaries"]}, set(MODEL_NAMES))
            self.assertNotIn("synthetic-excluded", json.dumps(report))
            self.assertNotIn("test_indices", json.dumps(report))
            with self.assertRaises(TrainingRunError):
                run_local_training(configuration(source, output))

    def test_cli_errors_sanitized_without_traceback(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            status = main(["--config", "synthetic-private-nonexistent"])
        self.assertEqual(status, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertNotIn("synthetic-private", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
