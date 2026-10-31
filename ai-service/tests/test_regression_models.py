"""Pipeline mechanics with artificial in-memory records, never scientific metrics."""

import unittest
from copy import deepcopy
from unittest.mock import patch

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.exceptions import NotFittedError
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.model_selection import KFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.svm import SVR

from training.form_schema import (
    ANALYTICAL_FIELDS, CONTEXT_FIELDS, ELIGIBILITY_FIELDS, ESBEU_FIELDS,
    FIELDS_BY_ID, ResponseValidationError, SpecialValue,
)
from training.regression_models import MODEL_NAMES, build_regression_pipeline
from training.regression_preprocessing import ALLOWED_PREDICTORS, prepare_regression_data


def synthetic_records(count=15):
    """Vary canonical context and items algorithmically, with no personal fields."""
    records = []
    for index in range(count):
        record = {f.identifier: f.choices[0] if f.choices else f.minimum
                  for f in ANALYTICAL_FIELDS}
        for offset, field in enumerate(CONTEXT_FIELDS):
            if field.choices:
                record[field.identifier] = field.choices[(index + offset) % len(field.choices)]
        record["sleep_hours"] = 1.0 + index / 2
        record["mandatory_hours_week"] = 2.0 + index
        record["work_hours_week"] = 0 if record["employment"] == "Não, apenas estudo" else index
        if index % 3 == 0:
            record["study_work_difficulty"] = SpecialValue.NOT_APPLICABLE
        for offset, field in enumerate(ESBEU_FIELDS):
            record[field.identifier] = (index * (offset + 1) + offset // 2) % 5
        records.append(record)
    return records


def finite_prediction_scorer(estimator, X, y):
    """Compatibility assertion; constant sentinel, not a performance measure."""
    prediction = estimator.predict(X)
    if prediction.shape != (len(y),) or not np.isfinite(prediction).all():
        raise AssertionError("Invalid synthetic prediction shape or finiteness")
    return 0.0


class RegressionModelsTests(unittest.TestCase):
    def setUp(self):
        self.data = prepare_regression_data(synthetic_records())

    def test_stable_catalog_and_estimator_types(self):
        self.assertEqual(MODEL_NAMES, ("dummy", "linear", "ridge", "random_forest", "svr"))
        expected = (DummyRegressor, LinearRegression, Ridge, RandomForestRegressor, SVR)
        for name, estimator_type in zip(MODEL_NAMES, expected):
            with self.subTest(model=name):
                pipeline = build_regression_pipeline(name)
                self.assertIsInstance(pipeline, Pipeline)
                self.assertEqual(list(pipeline.named_steps), ["preprocess", "regressor"])
                self.assertIsInstance(pipeline.named_steps["regressor"], estimator_type)
                self.assertIsInstance(clone(pipeline), Pipeline)

    def test_defaults_are_explicit_and_seed_configurable(self):
        dummy = build_regression_pipeline("dummy").named_steps["regressor"]
        self.assertEqual(dummy.strategy, "mean")
        ridge = build_regression_pipeline("ridge", random_state=7).named_steps["regressor"]
        self.assertEqual((ridge.alpha, ridge.random_state), (1.0, 7))
        forest = build_regression_pipeline("random_forest", random_state=7).named_steps["regressor"]
        self.assertEqual((forest.n_estimators, forest.max_depth, forest.min_samples_leaf,
                          forest.random_state, forest.n_jobs), (100, 3, 3, 7, 1))
        svr = build_regression_pipeline("svr").named_steps["regressor"]
        self.assertEqual((svr.kernel, svr.C, svr.epsilon, svr.gamma), ("rbf", 1.0, 0.1, "scale"))

    def test_scalar_configuration_is_copied_and_sklearn_params_work(self):
        cases = {
            "linear": {"fit_intercept": False, "positive": True},
            "ridge": {"alpha": 2.5, "tol": 0.002, "max_iter": 200},
            "random_forest": {"n_estimators": 7, "max_depth": 2, "min_samples_leaf": 2,
                              "max_features": 0.5},
            "svr": {"C": 2.0, "epsilon": 0.2, "kernel": "linear", "gamma": 0.2},
        }
        for name, config in cases.items():
            with self.subTest(model=name):
                original = config.copy()
                pipeline = build_regression_pipeline(name, model_params=config)
                for key, value in original.items():
                    self.assertEqual(pipeline.get_params()["regressor__" + key], value)
                self.assertEqual(config, original)
                config.clear()
                pipeline.fit(self.data.X, self.data.y)
                self.assertTrue(np.isfinite(pipeline.predict(self.data.X)).all())
        pipeline = build_regression_pipeline("ridge").set_params(regressor__alpha=3)
        self.assertEqual(clone(pipeline).get_params()["regressor__alpha"], 3)

    def test_invalid_model_and_configuration_are_sanitized(self):
        for name in ("synthetic-private", "Ridge", "", None, [], 1):
            with self.assertRaises(ValueError) as caught:
                build_regression_pipeline(name)
            self.assertNotIn("synthetic-private", str(caught.exception))
        for seed in (None, True, -1, 2**32, 1.5, "synthetic-private"):
            with self.assertRaises(ValueError):
                build_regression_pipeline("ridge", random_state=seed)
        for name, config in (
            ("dummy", {"strategy": "median"}), ("ridge", {"alpha": -1}),
            ("ridge", {"alpha": "synthetic-private"}), ("ridge", {"alpha": [1, 2]}),
            ("ridge", {"synthetic-private": 1}), ("ridge", {"random_state": 2}),
            ("random_forest", {"n_estimators": 0}), ("random_forest", {"max_depth": -1}),
            ("random_forest", {"min_samples_leaf": 0}),
            ("random_forest", {"n_jobs": 0}),
            ("svr", {"C": 0}), ("svr", {"epsilon": -1}),
            ("svr", {"kernel": "precomputed"}), ("svr", {"kernel": lambda x: x}),
            ("linear", {"fit_intercept": "synthetic-private"}),
            ("ridge", [1, 2]),
        ):
            with self.subTest(model=name, config_type=type(config).__name__):
                with self.assertRaises(ValueError) as caught:
                    build_regression_pipeline(name, model_params=config)
                self.assertNotIn("synthetic-private", str(caught.exception))
                self.assertIsNone(caught.exception.__context__)

    def test_every_call_has_independent_estimators_and_transformers(self):
        pipelines = [build_regression_pipeline(name) for _ in range(2) for name in MODEL_NAMES]
        components = []
        for pipeline in pipelines:
            pre = pipeline.named_steps["preprocess"]
            columns = pre.named_steps["columns"]
            components.extend([pipeline, pipeline.named_steps["regressor"], pre,
                               pre.named_steps["validate"], columns])
            components.extend(transformer for _, transformer, _ in columns.transformers)
        self.assertEqual(len(components), len({id(component) for component in components}))
        pipelines[0].fit(self.data.X, self.data.y)
        for pipeline in pipelines[1:]:
            self.assertFalse(hasattr(pipeline.named_steps["preprocess"].named_steps["columns"],
                                     "transformers_"))

    def test_fit_predict_each_model_without_input_mutation(self):
        X_before, y_before = self.data.X.copy(deep=True), self.data.y.copy(deep=True)
        for name in MODEL_NAMES:
            with self.subTest(model=name):
                pipeline = build_regression_pipeline(name)
                pipeline.fit(self.data.X.iloc[:10], self.data.y.iloc[:10])
                prediction = pipeline.predict(self.data.X.iloc[10:])
                self.assertEqual(prediction.shape, (5,))
                self.assertTrue(np.issubdtype(prediction.dtype, np.floating))
                self.assertTrue(np.isfinite(prediction).all())
                if name == "dummy":
                    np.testing.assert_allclose(prediction, self.data.y.iloc[:10].mean())
        pd.testing.assert_frame_equal(self.data.X, X_before)
        pd.testing.assert_series_equal(self.data.y, y_before)

    def test_prepare_preserves_positional_alignment_and_unrounded_scores(self):
        records = synthetic_records()
        before = deepcopy(records)
        data = prepare_regression_data(iter(records))
        self.assertEqual(records, before)
        self.assertEqual(data.predictors, ALLOWED_PREDICTORS)
        self.assertTrue(data.X.index.equals(data.y.index))
        for index, record in enumerate(records):
            self.assertEqual(data.y.iloc[index],
                             sum(record[f.identifier] for f in ESBEU_FIELDS) / 14)
            self.assertEqual(data.X.iloc[index]["sleep_hours"], record["sleep_hours"])
        self.assertGreater(data.y.nunique(), 1)
        self.assertTrue(any(value != int(value) for value in data.y))
        self.assertEqual(set(data.X.columns), {f.identifier for f in CONTEXT_FIELDS})

    def test_valid_numeric_nominal_na_and_mixed_subsets(self):
        for predictors in (("sleep_hours",), ("course_area",), ("study_work_difficulty",),
                           ("course_shift", "sleep_hours", "age_range")):
            data = prepare_regression_data(synthetic_records(), predictors)
            for name in MODEL_NAMES:
                with self.subTest(model=name, predictors=predictors):
                    pipeline = build_regression_pipeline(name, predictors)
                    pipeline.fit(data.X.iloc[:10], data.y.iloc[:10])
                    self.assertTrue(np.isfinite(pipeline.predict(data.X.iloc[10:])).all())

    def test_every_model_rejects_forbidden_predictors_at_construction(self):
        forbidden = [f.identifier for f in ESBEU_FIELDS + ELIGIBILITY_FIELDS] + [
            "esbeu_overall", "overall", "emotional_physical_exhaustion", "distancing",
            "training_inefficacy", "tcle_email", "timestamp", "participant_id", "email",
            "Carimbo de data/hora", "E-mail para recebimento da cópia do TCLE", "unknown",
        ]
        for name in MODEL_NAMES:
            for predictors in [(), ("sleep_hours", "sleep_hours"), (1,),
                               *(("sleep_hours", key) for key in forbidden)]:
                with self.subTest(model=name, predictors=predictors):
                    with self.assertRaises(ValueError):
                        build_regression_pipeline(name, predictors)

    def test_raw_x_extra_missing_reordered_and_wrong_types_fail_safely(self):
        invalid_frames = [self.data.X.drop(columns=["sleep_hours"]),
                          self.data.X[self.data.X.columns[::-1]], self.data.X.to_numpy()]
        for key in ("esbeu_01", "consent", "timestamp", "participant_id", "tcle_email"):
            invalid_frames.append(self.data.X.assign(**{key: "synthetic-private"}))
        for key, value in (("course_area", "synthetic-private"), ("sleep_hours", None),
                           ("sleep_hours", "synthetic-private"), ("semester", 2.0),
                           ("sleep_quality", True), ("sleep_hours", float("nan"))):
            frame = self.data.X.copy()
            frame.iloc[0, frame.columns.get_loc(key)] = value
            invalid_frames.append(frame)
        for name in MODEL_NAMES:
            pipeline = build_regression_pipeline(name).fit(self.data.X, self.data.y)
            for frame in invalid_frames:
                for operation in (pipeline.predict,
                                  lambda X: build_regression_pipeline(name).fit(X, self.data.y)):
                    with self.subTest(model=name, input_type=type(frame).__name__):
                        with self.assertRaises((ValueError, ResponseValidationError)) as caught:
                            operation(frame)
                        self.assertNotIn("synthetic-private", str(caught.exception))

    def test_factory_never_fits_and_clone_drops_training_state(self):
        with patch("training.regression_preprocessing.ContextFrameValidator.fit",
                   side_effect=AssertionError("Factory must not fit")):
            pipelines = [build_regression_pipeline(name) for name in MODEL_NAMES]
        for pipeline in pipelines:
            with self.assertRaises(NotFittedError):
                pipeline.predict(self.data.X)
            pipeline.fit(self.data.X, self.data.y)
            fresh = clone(pipeline)
            columns = fresh.named_steps["preprocess"].named_steps["columns"]
            self.assertFalse(hasattr(columns, "transformers_"))
            with self.assertRaises(NotFittedError):
                fresh.predict(self.data.X)

    def test_holdout_cannot_change_learned_training_statistics(self):
        selected = ("sleep_hours", "course_area", "study_work_difficulty")
        data = prepare_regression_data(synthetic_records(), selected)
        holdout = data.X.iloc[10:].copy()
        holdout["sleep_hours"] = 10000
        holdout["course_area"] = FIELDS_BY_ID["course_area"].choices[-1]
        for name in MODEL_NAMES:
            pipeline = build_regression_pipeline(name, selected).fit(data.X.iloc[:10], data.y.iloc[:10])
            pre = pipeline.named_steps["preprocess"]
            scaler = pre.named_steps["columns"].named_transformers_["numeric"]
            mean, scale = scaler.mean_.copy(), scaler.scale_.copy()
            np.testing.assert_allclose(mean, [data.X.iloc[:10]["sleep_hours"].mean()])
            pipeline.predict(holdout)
            np.testing.assert_array_equal(scaler.mean_, mean)
            np.testing.assert_array_equal(scaler.scale_, scale)
            self.assertEqual(scaler.n_samples_seen_, 10)

    def test_repeatability_with_same_seed(self):
        for name in MODEL_NAMES:
            first = build_regression_pipeline(name, random_state=17).fit(self.data.X, self.data.y)
            second = build_regression_pipeline(name, random_state=17).fit(self.data.X, self.data.y)
            np.testing.assert_allclose(first.predict(self.data.X), second.predict(self.data.X))

    def test_cross_validate_clones_and_fits_only_training_folds_with_rare_categories(self):
        records = synthetic_records(9)
        # Each non-first nominal alternative appears once, in only one holdout.
        for index, record in enumerate(records):
            record["course_area"] = FIELDS_BY_ID["course_area"].choices[0 if index < 6 else index - 5]
            record["study_work_difficulty"] = 0 if index < 6 else SpecialValue.NOT_APPLICABLE
        data = prepare_regression_data(records)
        splits = list(KFold(n_splits=3).split(data.X))
        for name in MODEL_NAMES:
            pipeline = build_regression_pipeline(name)
            result = cross_validate(pipeline, data.X, data.y, cv=splits,
                                    scoring=finite_prediction_scorer,
                                    return_estimator=True, error_score="raise")
            self.assertEqual(len(result["estimator"]), 3)
            self.assertFalse(hasattr(pipeline.named_steps["preprocess"].named_steps["columns"],
                                     "transformers_"))
            for fitted, (train, test) in zip(result["estimator"], splits):
                pre = fitted.named_steps["preprocess"]
                scaler = pre.named_steps["columns"].named_transformers_["numeric"]
                self.assertEqual(scaler.n_samples_seen_, len(train))
                converted = pre.named_steps["validate"].transform(data.X.iloc[train])
                numeric = pre.named_steps["columns"].transformers_[0][2]
                np.testing.assert_allclose(scaler.mean_, converted[numeric].mean().to_numpy())
                self.assertEqual(pre.transform(data.X.iloc[test]).shape, (len(test), 40))


if __name__ == "__main__":
    unittest.main()
