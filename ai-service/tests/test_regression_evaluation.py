"""Artificial fixtures test the evaluator, not the real questionnaire findings."""

from contextlib import redirect_stderr, redirect_stdout
from copy import deepcopy
from dataclasses import FrozenInstanceError, asdict
import io
import json
import math
import unittest
from unittest.mock import patch
import warnings

import numpy as np
import pandas as pd
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold
from sklearn.pipeline import Pipeline

from training.form_schema import ANALYTICAL_FIELDS, FIELDS_BY_ID, SpecialValue
from training.regression_evaluation import (
    RegressionEvaluationError, calculate_regression_metrics, evaluate_regression_models,
)
from training.regression_models import MODEL_NAMES, build_regression_pipeline
from training.regression_preprocessing import ContextFrameValidator, prepare_regression_data


PREDICTORS = ("sleep_hours", "course_area", "age_range", "physical_activity_days",
              "study_work_difficulty")


def synthetic_data(count=12, predictors=PREDICTORS):
    records = []
    for number in range(count):
        record = {f.identifier: f.choices[0] if f.choices else f.minimum
                  for f in ANALYTICAL_FIELDS}
        record["sleep_hours"] = 1 + number / 2
        for key in ("course_area", "age_range", "physical_activity_days"):
            choices = FIELDS_BY_ID[key].choices
            record[key] = choices[number % len(choices)]
        record["study_work_difficulty"] = (SpecialValue.NOT_APPLICABLE
                                            if number % 3 == 0 else number % 5)
        for index in range(1, 15):
            record[f"esbeu_{index:02d}"] = (number + (index == 1)) % 5
        records.append(record)
    return prepare_regression_data(records, predictors)


def baseline(predictors=PREDICTORS):
    return {"dummy": build_regression_pipeline("dummy", predictors)}


class RegressionMetricsTests(unittest.TestCase):
    def test_formulas_against_hand_calculation_and_negative_r2(self):
        # Residual magnitudes 1,0,1,2; SSE=6; SST=5. No sklearn oracle.
        metrics = calculate_regression_metrics([0, 1, 2, 3], [1, 1, 1, 1])
        self.assertEqual(metrics.mae, 1)
        self.assertAlmostEqual(metrics.rmse, math.sqrt(6 / 4))
        self.assertAlmostEqual(metrics.r2, 1 - 6 / 5)
        self.assertLess(metrics.r2, 0)
        self.assertIsNone(metrics.r2_undefined_reason)

    def test_perfect_nonconstant_predictions(self):
        metrics = calculate_regression_metrics([0, 1.25, 4], [0, 1.25, 4])
        self.assertEqual((metrics.mae, metrics.rmse, metrics.r2), (0, 0, 1))

    def test_singleton_has_error_metrics_and_explicit_undefined_r2(self):
        metrics = calculate_regression_metrics([2], [7])
        self.assertEqual((metrics.mae, metrics.rmse), (5, 5))
        self.assertIsNone(metrics.r2)
        self.assertEqual(metrics.r2_undefined_reason, "test_size_lt_2")

    def test_constant_target_is_undefined_even_for_perfect_prediction(self):
        for prediction in ([2, 2], [0, 4]):
            metrics = calculate_regression_metrics([2, 2], prediction)
            self.assertIsNone(metrics.r2)
            self.assertEqual(metrics.r2_undefined_reason, "constant_target")
            self.assertTrue(math.isfinite(metrics.mae))

    def test_predictions_are_not_clipped_to_scale(self):
        metrics = calculate_regression_metrics([0, 4], [-2, 6])
        self.assertEqual((metrics.mae, metrics.rmse, metrics.r2), (2, 2, 0))

    def test_invalid_metric_vectors_rejected_without_echo_or_context(self):
        for observed, predicted in (
            ([], []), ([0], []), ([0, 1], [0]), ([[0, 1]], [[0, 1]]),
            ([True, False], [0, 1]), ([0, 1], [True, False]),
            ([0, 1], [0, float("nan")]), ([0, 1], [0, float("inf")]),
            ([float("nan")], [0]), ([-1, 1], [0, 1]), ([0, 5], [0, 1]),
            (["synthetic-private"], [0]), ([0], ["synthetic-private"]),
            ([1 + 2j], [0]), ([0, 1], [1e308, -1e308]),
        ):
            with self.subTest(input_type=type(observed).__name__):
                with self.assertRaises(RegressionEvaluationError) as caught:
                    calculate_regression_metrics(observed, predicted)
                self.assertNotIn("synthetic-private", str(caught.exception))
                self.assertIsNone(caught.exception.__context__)


class RegressionEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.data = synthetic_data()

    def evaluate(self, data=None, **kwargs):
        selected = self.data if data is None else data
        return evaluate_regression_models(selected.X, selected.y, predictors=selected.predictors,
                                          n_splits=kwargs.pop("n_splits", 3), **kwargs)

    def test_all_five_models_and_structured_results(self):
        result = self.evaluate()
        self.assertEqual(tuple(m.name for m in result.models), MODEL_NAMES)
        self.assertEqual(result.predictors, PREDICTORS)
        self.assertEqual((result.protocol.n_samples, result.protocol.n_splits,
                          result.protocol.shuffle, result.protocol.split_random_state),
                         (12, 3, True, 42))
        for model in result.models:
            self.assertEqual((model.successful_folds, model.failed_folds), (3, 0))
            for fold in model.folds:
                self.assertEqual((fold.train_size, fold.test_size), (8, 4))
                self.assertIsNone(fold.failure)
                self.assertTrue(math.isfinite(fold.metrics.mae))
                self.assertTrue(math.isfinite(fold.metrics.rmse))
            self.assertEqual((model.mae.valid_folds, model.mae.undefined_folds,
                              model.mae.failed_folds), (3, 0, 0))

    def test_baseline_uses_only_train_mean_and_independent_fold_formulas(self):
        result = self.evaluate(models=baseline(), shuffle=False).models[0]
        expected = []
        for number, fold in enumerate(result.folds):
            test = list(range(number * 4, number * 4 + 4))
            train = [index for index in range(12) if index not in test]
            prediction = sum(self.data.y.iloc[index] for index in train) / len(train)
            observed = [self.data.y.iloc[index] for index in test]
            mae = sum(abs(value - prediction) for value in observed) / len(test)
            sse = sum((value - prediction) ** 2 for value in observed)
            average = sum(observed) / len(test)
            sst = sum((value - average) ** 2 for value in observed)
            self.assertEqual(fold.fold, number + 1)
            self.assertAlmostEqual(fold.metrics.mae, mae)
            self.assertAlmostEqual(fold.metrics.rmse, math.sqrt(sse / len(test)))
            self.assertAlmostEqual(fold.metrics.r2, 1 - sse / sst)
            expected.append(mae)
        average = sum(expected) / len(expected)
        sample_std = math.sqrt(sum((value - average) ** 2 for value in expected) / 2)
        self.assertAlmostEqual(result.mae.mean, average)
        self.assertAlmostEqual(result.mae.std, sample_std)

    def test_uneven_folds_have_unweighted_mean_and_sample_std(self):
        result = self.evaluate(synthetic_data(7), models=baseline(), shuffle=False).models[0]
        self.assertEqual([fold.test_size for fold in result.folds], [3, 2, 2])
        for attribute in ("mae", "rmse", "r2"):
            values = [getattr(fold.metrics, attribute) for fold in result.folds]
            average = sum(values) / 3
            expected_std = math.sqrt(sum((value - average) ** 2 for value in values) / 2)
            aggregate = getattr(result, attribute)
            self.assertAlmostEqual(aggregate.mean, average)
            self.assertAlmostEqual(aggregate.std, expected_std)

    def test_same_materialized_partitions_for_every_model(self):
        seen_train, seen_test = {}, {}
        original_fit, original_predict, original_split = Pipeline.fit, Pipeline.predict, KFold.split
        split_calls = []

        def fit(pipeline, X, y, **kwargs):
            name = type(pipeline.named_steps["regressor"]).__name__
            seen_train.setdefault(name, []).append(tuple(X.index))
            return original_fit(pipeline, X, y, **kwargs)

        def predict(pipeline, X, **kwargs):
            name = type(pipeline.named_steps["regressor"]).__name__
            seen_test.setdefault(name, []).append(tuple(X.index))
            return original_predict(pipeline, X, **kwargs)

        def split(splitter, X, *args, **kwargs):
            split_calls.append(len(X))
            return original_split(splitter, X, *args, **kwargs)

        with patch.object(Pipeline, "fit", fit), patch.object(Pipeline, "predict", predict), \
                patch.object(KFold, "split", split):
            self.evaluate(random_state=19)
        self.assertEqual(split_calls, [12])
        for observed in (seen_train, seen_test):
            self.assertEqual(len(observed), 5)
            first = next(iter(observed.values()))
            self.assertTrue(all(partitions == first for partitions in observed.values()))
        train, test = next(iter(seen_train.values())), next(iter(seen_test.values()))
        self.assertEqual(sorted(index for fold in test for index in fold), list(range(12)))
        for train_rows, test_rows in zip(train, test):
            self.assertTrue(set(train_rows).isdisjoint(test_rows))
            self.assertEqual(set(train_rows) | set(test_rows), set(range(12)))

    def test_scaler_and_validator_are_fitted_only_on_each_train(self):
        captured, validator_sizes = [], []
        original_fit, original_validate_fit = Pipeline.fit, ContextFrameValidator.fit

        def fit(pipeline, X, y, **kwargs):
            fitted = original_fit(pipeline, X, y, **kwargs)
            scaler = pipeline.named_steps["preprocess"].named_steps["columns"].named_transformers_["numeric"]
            expected = X["sleep_hours"].mean()
            self.assertAlmostEqual(scaler.mean_[0], expected)
            self.assertEqual(scaler.n_samples_seen_, len(X))
            captured.append((pipeline, tuple(X.index), scaler.mean_.copy()))
            return fitted

        def validate_fit(validator, X, y=None):
            validator_sizes.append(len(X))
            return original_validate_fit(validator, X, y)

        self.data.X.loc[[0, 1, 2, 3], "sleep_hours"] = 10000
        with patch.object(Pipeline, "fit", fit), patch.object(ContextFrameValidator, "fit", validate_fit):
            self.evaluate(shuffle=False)
        self.assertEqual(len(captured), 15)
        self.assertEqual(validator_sizes, [8] * 15)
        self.assertEqual(len({id(item[0]) for item in captured}), 15)
        for pipeline, train, before in captured:
            scaler = pipeline.named_steps["preprocess"].named_steps["columns"].named_transformers_["numeric"]
            np.testing.assert_array_equal(scaler.mean_, before)
            if 0 not in train:
                self.assertLess(scaler.mean_[0], 10)

    def test_repeated_runs_with_same_seed_are_identical(self):
        self.assertEqual(self.evaluate(random_state=17), self.evaluate(random_state=17))

    def test_split_seed_changes_partitions(self):
        from training import regression_evaluation as module
        original = module._evaluate_fold
        seen = []

        def spy(template, X, y, train, test, number):
            seen.append(tuple(test))
            return original(template, X, y, train, test, number)

        with patch.object(module, "_evaluate_fold", spy):
            self.evaluate(models=baseline(), random_state=1)
            self.evaluate(models=baseline(), random_state=2)
        self.assertNotEqual(seen[:3], seen[3:])

    def test_no_shuffle_records_no_split_seed_and_uses_row_order(self):
        result = self.evaluate(models=baseline(), shuffle=False, random_state=17)
        self.assertIsNone(result.protocol.split_random_state)
        self.assertFalse(result.protocol.shuffle)
        self.assertEqual(result, self.evaluate(models=baseline(), shuffle=False, random_state=19))

    def test_custom_pipelines_and_subsets_in_catalog_order(self):
        models = {"svr": build_regression_pipeline("svr", PREDICTORS, model_params={"C": 2}),
                  "ridge": build_regression_pipeline("ridge", PREDICTORS, model_params={"alpha": 2}),
                  **baseline()}
        result = self.evaluate(models=models)
        self.assertEqual(tuple(model.name for model in result.models), ("dummy", "ridge", "svr"))
        self.assertEqual(models["ridge"].get_params()["regressor__alpha"], 2)
        for pipeline in models.values():
            self.assertFalse(hasattr(pipeline.named_steps["preprocess"].named_steps["columns"], "transformers_"))

    def test_report_records_scalar_model_configuration_and_seeds(self):
        result = self.evaluate(random_state=17)
        for model in result.models:
            actual = dict(model.parameters)
            expected = build_regression_pipeline(model.name, PREDICTORS, random_state=17)
            self.assertEqual(actual, expected.named_steps["regressor"].get_params(deep=False))
            self.assertNotIn("coef_", actual)
            self.assertNotIn("estimators_", actual)
            if model.name in ("ridge", "random_forest"):
                self.assertEqual(actual["random_state"], 17)

    def test_fitted_caller_pipeline_is_cloned_and_not_changed(self):
        fitted = build_regression_pipeline("ridge", PREDICTORS).fit(self.data.X, self.data.y)
        coefficients = fitted.named_steps["regressor"].coef_.copy()
        scaler = fitted.named_steps["preprocess"].named_steps["columns"].named_transformers_["numeric"]
        mean_before = scaler.mean_.copy()
        result = self.evaluate(models={**baseline(), "ridge": fitted})
        self.assertEqual(result.models[1].successful_folds, 3)
        np.testing.assert_array_equal(fitted.named_steps["regressor"].coef_, coefficients)
        np.testing.assert_array_equal(scaler.mean_, mean_before)
        self.assertEqual(scaler.n_samples_seen_, 12)

    def test_inputs_and_indexes_preserved(self):
        X, y = deepcopy(self.data.X), deepcopy(self.data.y)
        self.data.X.index = self.data.y.index = pd.Index(range(100, 220, 10))
        indexed_X, indexed_y = deepcopy(self.data.X), deepcopy(self.data.y)
        self.evaluate()
        pd.testing.assert_frame_equal(self.data.X, indexed_X)
        pd.testing.assert_series_equal(self.data.y, indexed_y)
        pd.testing.assert_frame_equal(self.data.X.reset_index(drop=True), X)
        pd.testing.assert_series_equal(self.data.y.reset_index(drop=True), y)

    def test_all_official_categories_exclusive_to_holdout_work(self):
        data = synthetic_data(9)
        for index in range(9):
            data.X.loc[index, "course_area"] = FIELDS_BY_ID["course_area"].choices[0 if index < 6 else index - 5]
            data.X.loc[index, "study_work_difficulty"] = 0 if index < 6 else SpecialValue.NOT_APPLICABLE
        result = self.evaluate(data, shuffle=False)
        self.assertTrue(all(model.failed_folds == 0 for model in result.models))

    def test_numeric_only_and_nominal_only_predictors(self):
        for predictors in (("sleep_hours",), ("course_area",), ("study_work_difficulty",)):
            result = self.evaluate(synthetic_data(predictors=predictors))
            self.assertTrue(all(model.failed_folds == 0 for model in result.models))
            self.assertEqual(result.predictors, predictors)

    def test_two_cases_and_leave_one_out_have_no_r2(self):
        for count in (2, 5):
            result = self.evaluate(synthetic_data(count), n_splits=count, models=baseline())
            model = result.models[0]
            self.assertEqual(model.mae.valid_folds, count)
            self.assertEqual((model.r2.mean, model.r2.std, model.r2.valid_folds,
                              model.r2.undefined_folds, model.r2.failed_folds),
                             (None, None, 0, count, 0))
            self.assertTrue(all(f.metrics.r2_undefined_reason == "test_size_lt_2" for f in model.folds))

    def test_constant_target_has_no_fabricated_r2(self):
        self.data.y[:] = 2.0
        result = self.evaluate(models=baseline()).models[0]
        self.assertEqual((result.mae.mean, result.rmse.mean), (0, 0))
        self.assertIsNone(result.r2.mean)
        self.assertEqual(result.r2.undefined_folds, 3)
        self.assertTrue(all(f.metrics.r2_undefined_reason == "constant_target" for f in result.folds))

    def test_mixed_undefined_folds_and_single_valid_std_are_explicit(self):
        data = synthetic_data(5)
        data.y[:] = [0, 0, 1, 2, 3]
        result = self.evaluate(data, models=baseline(), shuffle=False).models[0]
        self.assertEqual((result.r2.valid_folds, result.r2.undefined_folds,
                          result.r2.failed_folds), (1, 2, 0))
        self.assertIsNotNone(result.r2.mean)
        self.assertIsNone(result.r2.std)
        self.assertEqual(result.mae.valid_folds, 3)
        self.assertEqual(result.folds[0].metrics.r2_undefined_reason, "constant_target")
        self.assertEqual(result.folds[2].metrics.r2_undefined_reason, "test_size_lt_2")

    def test_invalid_split_and_predictor_configuration_rejected(self):
        configurations = [dict(n_splits=value) for value in (0, 1, 13, True, "3", 3.0)]
        configurations += [dict(shuffle=value) for value in (None, 1, "synthetic-private")]
        configurations += [dict(random_state=value) for value in (None, True, -1, 2**32)]
        configurations += [dict(predictors=value) for value in (None, (), ("sleep_hours", "sleep_hours"),
                                                                   ("esbeu_01",), ("participant_id",))]
        with patch.object(Pipeline, "fit", side_effect=AssertionError("Must not fit")):
            for config in configurations:
                options = dict(predictors=PREDICTORS, n_splits=3, models=baseline())
                options.update(config)
                with self.assertRaises(RegressionEvaluationError) as caught:
                    evaluate_regression_models(self.data.X, self.data.y, **options)
                self.assertNotIn("synthetic-private", str(caught.exception))
                self.assertIsNone(caught.exception.__context__)

    def test_invalid_x_y_rejected_before_any_fit(self):
        invalid = [(self.data.X, self.data.y.iloc[:-1]), (self.data.X, self.data.y.iloc[::-1]),
                   (self.data.X.to_numpy(), self.data.y), (self.data.X, self.data.y.to_numpy()),
                   (self.data.X.drop(columns=["sleep_hours"]), self.data.y),
                   (self.data.X[self.data.X.columns[::-1]], self.data.y)]
        for key in ("esbeu_01", "esbeu_overall", "consent", "participant_id", "timestamp", "tcle_email"):
            invalid.append((self.data.X.assign(**{key: "synthetic-private"}), self.data.y))
        for key, value in (("course_area", "synthetic-private"), ("sleep_hours", None),
                           ("sleep_hours", float("nan")), ("study_work_difficulty", "0")):
            frame = self.data.X.copy()
            frame.loc[0, key] = value
            invalid.append((frame, self.data.y))
        for value in (float("inf"), float("nan"), -0.1, 4.1):
            target = self.data.y.copy()
            target.iloc[0] = value
            invalid.append((self.data.X, target))
        for target in (pd.Series([True] * 12), pd.Series(["synthetic-private"] * 12),
                       pd.Series([1 + 2j] * 12)):
            invalid.append((self.data.X, target))
        for count in (0, 1):
            invalid.append((self.data.X.iloc[:count], self.data.y.iloc[:count]))
        with patch.object(Pipeline, "fit", side_effect=AssertionError("Must not fit")):
            for X, y in invalid:
                with self.assertRaises(RegressionEvaluationError) as caught:
                    evaluate_regression_models(X, y, predictors=PREDICTORS, n_splits=3)
                self.assertNotIn("synthetic-private", str(caught.exception))
                self.assertIsNone(caught.exception.__context__)

    def test_invalid_supplied_models_rejected_without_fitting(self):
        wrong_order = build_regression_pipeline("ridge", PREDICTORS[::-1])
        wrong_alpha = build_regression_pipeline("ridge", PREDICTORS).set_params(regressor__alpha=-1)
        no_seed = build_regression_pipeline("random_forest", PREDICTORS).set_params(regressor__random_state=None)
        verbose = build_regression_pipeline("ridge", PREDICTORS).set_params(verbose=True)
        cached = build_regression_pipeline("ridge", PREDICTORS).set_params(memory="synthetic-private")
        no_scale = build_regression_pipeline("ridge", PREDICTORS).set_params(
            preprocess__columns__numeric__with_mean=False)
        learned_categories = build_regression_pipeline("ridge", PREDICTORS).set_params(
            preprocess__columns__categorical__categories="auto")
        precomputed = build_regression_pipeline("svr", PREDICTORS).set_params(regressor__kernel="precomputed")
        nonfinite = build_regression_pipeline("svr", PREDICTORS).set_params(regressor__coef0=float("nan"))
        no_jobs = build_regression_pipeline("random_forest", PREDICTORS).set_params(regressor__n_jobs=0)
        median = build_regression_pipeline("dummy", PREDICTORS).set_params(regressor__strategy="median")
        cases = [None, {}, {"ridge": build_regression_pipeline("ridge", PREDICTORS)},
                 {**baseline(), "synthetic-private": object()}, {"dummy": median}]
        cases += [{**baseline(), "ridge": p} for p in
                  (wrong_order, wrong_alpha, verbose, cached, no_scale, learned_categories, object())]
        cases += [{**baseline(), "random_forest": no_seed}, [1, 2]]
        cases += [{**baseline(), "svr": p} for p in (precomputed, nonfinite)]
        cases += [{**baseline(), "random_forest": no_jobs}]
        # None intentionally means default catalog and is tested elsewhere.
        with patch.object(Pipeline, "fit", side_effect=AssertionError("Must not fit")):
            for models in cases[1:]:
                with self.assertRaises(RegressionEvaluationError) as caught:
                    self.evaluate(models=models)
                self.assertNotIn("synthetic-private", str(caught.exception))
                self.assertIsNone(caught.exception.__context__)

    def test_fit_and_predict_failures_are_sanitized_and_counted(self):
        for method, code in (("fit", "fit_failed"), ("predict", "predict_failed")):
            stdout, stderr = io.StringIO(), io.StringIO()
            with patch.object(Pipeline, method, side_effect=ValueError("synthetic-private")), \
                    redirect_stdout(stdout), redirect_stderr(stderr):
                result = self.evaluate(models=baseline())
            model = result.models[0]
            self.assertEqual((model.successful_folds, model.failed_folds), (0, 3))
            self.assertTrue(all(f.metrics is None and f.failure == code for f in model.folds))
            for aggregate in (model.mae, model.rmse, model.r2):
                self.assertEqual((aggregate.mean, aggregate.std, aggregate.valid_folds,
                                  aggregate.undefined_folds, aggregate.failed_folds),
                                 (None, None, 0, 0, 3))
            self.assertEqual(stdout.getvalue() + stderr.getvalue(), "")
            self.assertNotIn("synthetic-private", json.dumps(asdict(result), allow_nan=False))

    def test_invalid_predictions_fail_fold_without_zero_filling(self):
        for prediction in (np.array([float("nan")] * 4), np.array([float("inf")] * 4),
                           np.zeros((4, 1)), np.zeros(3), np.array(["synthetic-private"] * 4)):
            with patch.object(Pipeline, "predict", return_value=prediction):
                result = self.evaluate(models=baseline()).models[0]
            self.assertTrue(all(f.failure == "metrics_failed" for f in result.folds))
            self.assertIsNone(result.mae.mean)
            self.assertEqual(result.mae.failed_folds, 3)

    def test_clone_failures_are_structured_per_fold(self):
        with patch("training.regression_evaluation.clone", side_effect=ValueError("synthetic-private")):
            result = self.evaluate()
        for model in result.models:
            self.assertEqual(model.failed_folds, 3)
            self.assertTrue(all(f.failure == "clone_failed" for f in model.folds))
        self.assertNotIn("synthetic-private", json.dumps(asdict(result), allow_nan=False))

    def test_single_successful_fold_has_no_invented_std(self):
        original, attempts = Pipeline.fit, []

        def fit(pipeline, X, y, **kwargs):
            attempts.append(1)
            if len(attempts) <= 2:
                raise ValueError("synthetic-private")
            return original(pipeline, X, y, **kwargs)

        with patch.object(Pipeline, "fit", fit):
            result = self.evaluate(models=baseline()).models[0]
        self.assertEqual((result.mae.valid_folds, result.mae.failed_folds), (1, 2))
        self.assertIsNotNone(result.mae.mean)
        self.assertIsNone(result.mae.std)

    def test_partial_model_failure_does_not_hide_missing_folds(self):
        original, attempts = Pipeline.fit, []

        def fit(pipeline, X, y, **kwargs):
            if isinstance(pipeline.named_steps["regressor"], Ridge):
                attempts.append(1)
                if len(attempts) == 1:
                    raise ValueError("synthetic-private")
            return original(pipeline, X, y, **kwargs)

        with patch.object(Pipeline, "fit", fit):
            result = self.evaluate(models={**baseline(), "ridge": build_regression_pipeline("ridge", PREDICTORS)})
        dummy, ridge = result.models
        self.assertEqual((dummy.successful_folds, dummy.failed_folds), (3, 0))
        self.assertEqual((ridge.successful_folds, ridge.failed_folds), (2, 1))
        self.assertEqual((ridge.mae.valid_folds, ridge.mae.undefined_folds, ridge.mae.failed_folds), (2, 0, 1))
        self.assertIsNotNone(ridge.mae.std)

    def test_warnings_are_sanitized_without_hiding_convergence_status(self):
        original = Ridge.fit

        def fit(estimator, X, y, **kwargs):
            warnings.warn("synthetic-private", ConvergenceWarning)
            warnings.warn("synthetic-private", UserWarning)
            return original(estimator, X, y, **kwargs)

        with patch.object(Ridge, "fit", fit), warnings.catch_warnings(record=True) as external:
            result = self.evaluate(models={**baseline(), "ridge": build_regression_pipeline("ridge", PREDICTORS)})
        self.assertEqual(external, [])
        self.assertTrue(all(f.warning_codes == ("convergence_warning", "model_warning")
                            for f in result.models[1].folds))
        self.assertNotIn("synthetic-private", json.dumps(asdict(result), allow_nan=False))

    def test_interrupts_propagate(self):
        with patch.object(Pipeline, "fit", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                self.evaluate(models=baseline())

    def test_strict_json_and_immutable_results_exclude_individual_data(self):
        result = self.evaluate(models=baseline())
        payload = asdict(result)
        serialized = json.dumps(payload, allow_nan=False)
        self.assertNotIn("predictions", serialized)
        self.assertNotIn("train_indices", serialized)
        self.assertNotIn("test_indices", serialized)
        self.assertNotIn("participant_id", serialized)
        self.assertEqual(set(payload), {"protocol", "predictors", "models"})
        with self.assertRaises(FrozenInstanceError):
            result.protocol.n_samples = 100
        with self.assertRaises(FrozenInstanceError):
            result.models[0].mae.mean = 0


if __name__ == "__main__":
    unittest.main()
