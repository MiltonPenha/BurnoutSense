"""Synthetic-only v2 protocol, leakage, reproducibility and failure tests."""

import io
import json
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout, redirect_stderr

import numpy as np
from sklearn.model_selection import KFold

from training.form_schema import ANALYTICAL_FIELDS, SpecialValue
from training.regression_evaluation import calculate_regression_metrics
from training.regression_experiments import Candidate, ExperimentProtocol
from training.regression_preprocessing import ALLOWED_PREDICTORS, prepare_regression_data
from training.optimization_v2 import (
    FAMILIES, PREDICTOR_SETS, V2Candidate, aggregate, build_candidate,
    default_candidates, paired_comparison, run_optimization_v2,
)


PROTOCOL = ExperimentProtocol(2, 2, 1, 42)
MODELS = (Candidate("dummy"), Candidate("ridge", (("alpha", 10.0),)),
          Candidate("random_forest", (("n_estimators", 2), ("max_depth", 2))),
          Candidate("svr", (("C", 0.1),)))
GRID = tuple(V2Candidate(subset, model) for subset in PREDICTOR_SETS for model in MODELS)


def synthetic_data(count=12):
    records = []
    for i in range(count):
        record = {f.identifier: f.choices[0] if f.choices else f.minimum
                  for f in ANALYTICAL_FIELDS}
        record["sleep_hours"] = 1 + i / 2
        record.update({f"esbeu_{j:02d}": (i + j) % 5 for j in range(1, 15)})
        records.append(record)
    return prepare_regression_data(records)


class OptimizationV2Tests(unittest.TestCase):
    def test_sets_and_controlled_grid(self):
        default = ExperimentProtocol()
        self.assertEqual((default.outer_splits, default.inner_splits,
                          default.outer_repeats, default.random_state), (5, 3, 3, 42))
        self.assertEqual([len(s) for s in PREDICTOR_SETS.values()], [22, 12, 7])
        self.assertEqual(PREDICTOR_SETS["A"], ALLOWED_PREDICTORS)
        for selected in PREDICTOR_SETS.values():
            self.assertEqual(selected, tuple(k for k in ALLOWED_PREDICTORS if k in selected))
            self.assertFalse(any(k.startswith("esbeu_") for k in selected))
        grid = default_candidates()
        self.assertEqual(len(grid), 21)
        self.assertEqual({c.model.name for c in grid}, set(FAMILIES))
        self.assertNotIn("linear", FAMILIES)
        self.assertEqual({c.model for c in grid if c.subset == "A"},
                         {c.model for c in grid if c.subset == "C"})

    def test_metrics_negative_and_undefined_r2(self):
        metrics = calculate_regression_metrics([0, 1, 2, 3], [1, 1, 3, 5])
        self.assertEqual(metrics.mae, 1)
        self.assertAlmostEqual(metrics.rmse, (6 / 4) ** 0.5)
        self.assertAlmostEqual(metrics.r2, -0.2)
        constant = calculate_regression_metrics([1, 1], [0, 2])
        self.assertIsNone(constant.r2)
        self.assertEqual(constant.r2_undefined_reason, "constant_target")
        self.assertEqual(aggregate([None], 2, 1).undefined_folds, 1)

    def test_paired_difference_and_fold_alignment(self):
        def fold(number, mae):
            return {"repeat": 1, "fold": number, "metrics": {"mae": mae}}
        result = paired_comparison([fold(1, 0.2), fold(2, 0.8)],
                                   [fold(1, 0.5), fold(2, 0.5)])
        self.assertAlmostEqual(result["mae_difference"]["mean"], 0)
        self.assertEqual((result["wins"], result["losses"]), (1, 1))
        with self.assertRaises(ValueError):
            paired_comparison([fold(1, 1)], [fold(2, 1)])

    def test_pipeline_scaler_train_only_and_rare_schema_categories(self):
        data = synthetic_data()
        model = build_candidate(V2Candidate("A", Candidate("ridge")))
        train, test = data.X.iloc[:8].copy(), data.X.iloc[8:].copy()
        test["sleep_hours"] = 10000
        test["course_area"] = "Ciências Exatas"
        test["study_work_difficulty"] = SpecialValue.NOT_APPLICABLE
        model.fit(train, data.y.iloc[:8])
        scaler = model.named_steps["model"].named_steps["preprocess"].named_steps[
            "columns"].named_transformers_["numeric"]
        before = scaler.mean_.copy()
        self.assertTrue(np.isfinite(model.predict(test)).all())
        np.testing.assert_array_equal(before, scaler.mean_)
        self.assertEqual(scaler.n_samples_seen_, 8)

    def test_reproducible_aggregate_report_and_input_preserved(self):
        data = synthetic_data()
        original = data.X.copy(deep=True)
        output = io.StringIO()
        with redirect_stdout(output), redirect_stderr(output):
            first = run_optimization_v2(data, protocol=PROTOCOL, candidates=GRID)
            second = run_optimization_v2(data, protocol=PROTOCOL, candidates=GRID)
        self.assertEqual(first, second)
        self.assertEqual(output.getvalue(), "")
        self.assertTrue(data.X.equals(original))
        self.assertEqual(sum(first["subset_frequency"].values()), 2)
        self.assertEqual(sum(first["model_frequency"].values()), 2)
        text = json.dumps(first, allow_nan=False)
        for forbidden in ('"predictions"', '"y_true"', '"records"', '"row_id"'):
            self.assertNotIn(forbidden, text)
        self.assertEqual(first["selection"]["summary"]["mae"]["valid_folds"], 2)

    def test_inner_selection_sees_only_external_train_and_never_outer_scores(self):
        from training import optimization_v2 as module
        data = synthetic_data()
        expected = [set(train) for train, _ in KFold(2, shuffle=True, random_state=42).split(data.X)]
        seen = []
        original_tune = module._tune

        def tune(grid, X, y, partitions, seed):
            seen.append(set(X.index))
            for train, test in partitions:
                self.assertTrue(set(train).isdisjoint(test))
                self.assertEqual(set(train) | set(test), set(range(len(X))))
            return original_tune(grid, X, y, partitions, seed)

        # Different synthetic outer outcomes cannot change choices made by inner CV.
        def outer_trial(candidate, X, y, train, test, seed):
            if len(X) == 12:
                metrics = calculate_regression_metrics([0, 1], [4, 4])
                return metrics, None, ()
            return original_trial(candidate, X, y, train, test, seed)

        original_trial = module._trial
        normal = run_optimization_v2(data, protocol=PROTOCOL, candidates=GRID)
        with patch.object(module, "_tune", side_effect=tune), patch.object(
                module, "_trial", side_effect=outer_trial):
            changed = run_optimization_v2(data, protocol=PROTOCOL, candidates=GRID)
        self.assertEqual(seen, expected)
        self.assertEqual([f["candidate"] for f in normal["selection"]["folds"]],
                         [f["candidate"] for f in changed["selection"]["folds"]])

    def test_failures_sanitized_and_not_averaged_away(self):
        from training.optimization_v2 import _trial
        data = synthetic_data()
        with patch("training.optimization_v2.build_candidate") as builder:
            builder.return_value.fit.side_effect = RuntimeError("synthetic-secret")
            trial = _trial(GRID[0], data.X, data.y, np.arange(8), np.arange(8, 12), 42)
        self.assertEqual(trial, (None, "fit_failed", ()))
        with patch("training.optimization_v2.build_candidate",
                   side_effect=RuntimeError("synthetic-secret")):
            # Configuration validation fails safely before any experiment.
            with self.assertRaisesRegex(ValueError, "protocolo v2"):
                run_optimization_v2(synthetic_data(), protocol=PROTOCOL, candidates=GRID)
        with patch("training.optimization_v2._trial", return_value=(None, "fit_failed", ())):
            report = run_optimization_v2(synthetic_data(), protocol=PROTOCOL, candidates=GRID)
        self.assertEqual(report["failed_selection_folds"], 2)
        self.assertIsNone(report["selection"]["summary"]["mae"]["mean"])
        self.assertTrue(all(s["failed_folds"] == 2 for a in report["inner_audit"] for s in a["scores"]))
        self.assertNotIn("synthetic-secret", json.dumps(report))

    def test_invalid_data_and_uncontrolled_grids_rejected(self):
        for grid in (GRID[:-1], GRID + (GRID[0],),
                     (V2Candidate("D", Candidate("dummy")),) + GRID[1:]):
            with self.assertRaises(ValueError):
                run_optimization_v2(synthetic_data(), protocol=PROTOCOL, candidates=grid)
        data = synthetic_data()
        data.X["esbeu_01"] = 1
        with self.assertRaises(ValueError):
            run_optimization_v2(data, protocol=PROTOCOL, candidates=GRID)


if __name__ == "__main__":
    unittest.main()
