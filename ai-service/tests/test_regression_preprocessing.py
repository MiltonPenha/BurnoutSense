"""Synthetic regression preparation only; no regressors or real data."""

import csv
import io
import unittest
from unittest.mock import patch

import numpy as np
from sklearn.base import clone
from sklearn.exceptions import NotFittedError

from training.esbeu_scoring import calculate_esbeu_scores
from training.form_schema import (
    ANALYTICAL_FIELDS, CONTEXT_FIELDS, IneligibleRecordError,
    ResponseValidationError, SpecialValue,
)
from training.import_forms import import_forms_csv
from training.regression_preprocessing import (
    ALLOWED_PREDICTORS, build_regression_preprocessor, prepare_regression_data,
    validate_predictors,
)


def synthetic_record(score=0, hours=1):
    record = {field.identifier: field.choices[0] if field.choices else field.minimum
              for field in ANALYTICAL_FIELDS}
    record.update({f"esbeu_{i:02d}": score for i in range(1, 15)})
    record["sleep_hours"] = hours
    return record


class RegressionPreprocessingTests(unittest.TestCase):
    def test_changing_outcomes_never_changes_predictors(self):
        low = prepare_regression_data([synthetic_record(0)])
        high = prepare_regression_data([synthetic_record(4)])
        self.assertTrue(low.X.equals(high.X))
        self.assertNotEqual(low.y.tolist(), high.y.tolist())

    def test_extraction_alignment_and_canonical_outcome(self):
        records = [synthetic_record(3), synthetic_record(1)]
        data = prepare_regression_data(records)
        self.assertEqual(tuple(data.X.columns), ALLOWED_PREDICTORS)
        self.assertEqual(set(ALLOWED_PREDICTORS), {f.identifier for f in CONTEXT_FIELDS})
        self.assertEqual(data.y.tolist(), [3.0, 1.0])
        self.assertTrue(data.X.index.equals(data.y.index))
        with patch("training.regression_preprocessing.calculate_esbeu_scores",
                   wraps=calculate_esbeu_scores) as scorer:
            prepare_regression_data(records)
            self.assertEqual(scorer.call_count, 2)

    def test_allowlist_rejects_every_forbidden_predictor(self):
        forbidden = [f"esbeu_{i:02d}" for i in range(1, 15)] + [
            "overall", "esbeu_overall", "emotional_physical_exhaustion", "distancing",
            "training_inefficacy", "consent", "adult", "enrolled", "tcle_email",
            "timestamp", "participant_id", "unknown", "derived_score",
        ]
        for key in forbidden:
            with self.subTest(key=key):
                for function in (validate_predictors, build_regression_preprocessor):
                    with self.assertRaises(ValueError):
                        function(("sleep_hours", key))
        for selected in ((), ("sleep_hours", "sleep_hours")):
            with self.assertRaises(ValueError):
                validate_predictors(selected)

    def test_invalid_incomplete_ineligible_and_extra_fields_rejected(self):
        for key in ("esbeu_01", "sleep_hours", "age_range", "consent"):
            for value in (None, "invalid-synthetic", True):
                record = synthetic_record()
                record[key] = value
                with self.assertRaises(ResponseValidationError):
                    prepare_regression_data([record])
            record = synthetic_record()
            del record[key]
            with self.assertRaises(ResponseValidationError):
                prepare_regression_data([record])
        for key in ("overall", "timestamp", "tcle_email", "derived_score"):
            record = synthetic_record()
            record[key] = 1
            with self.assertRaises(ResponseValidationError):
                prepare_regression_data([record])
        record = synthetic_record()
        record["adult"] = "Não"
        with self.assertRaises(IneligibleRecordError):
            prepare_regression_data([record])
        with self.assertRaises(ValueError):
            prepare_regression_data([])

    def test_categorical_nominal_and_ordered_conversion(self):
        records = [synthetic_record(), synthetic_record()]
        records[1].update(age_range="21 a 23 anos", physical_activity_days="3 dias",
                          course_area="Ciências Exatas")
        data = prepare_regression_data(records)
        processor = build_regression_preprocessor(scale_numeric=False)
        encoded = processor.fit_transform(data.X)
        names = list(processor.get_feature_names_out())
        self.assertEqual(encoded[1, names.index("numeric__age_range")], 1)
        self.assertEqual(encoded[1, names.index("numeric__physical_activity_days")], 3)
        self.assertEqual(encoded[0, names.index("numeric__sleep_hours")], 1)
        for label in ("Engenharias e Tecnologia", "Ciências Exatas"):
            self.assertIn("categorical__course_area_" + label, names)

    def test_na_and_zero_are_separate_without_imputation(self):
        records = [synthetic_record(), synthetic_record()]
        records[1]["study_work_difficulty"] = SpecialValue.NOT_APPLICABLE
        data = prepare_regression_data(records)
        self.assertIs(data.X.iloc[1]["study_work_difficulty"], SpecialValue.NOT_APPLICABLE)
        processor = build_regression_preprocessor()
        encoded = processor.fit_transform(data.X)
        names = list(processor.get_feature_names_out())
        zero = names.index("categorical__study_work_difficulty_0")
        na = names.index("categorical__study_work_difficulty_Não se aplica")
        np.testing.assert_array_equal(encoded[:, [zero, na]], [[1, 0], [0, 1]])

    def test_train_only_statistics_and_transform_does_not_refit(self):
        train = prepare_regression_data(
            [synthetic_record(hours=1), synthetic_record(hours=3)], ("sleep_hours",))
        test = prepare_regression_data([synthetic_record(hours=10000)], ("sleep_hours",))
        processor = build_regression_preprocessor(("sleep_hours",))
        with self.assertRaises(NotFittedError):
            processor.transform(test.X)
        processor.fit(train.X)
        scaler = processor.named_steps["columns"].named_transformers_["numeric"]
        np.testing.assert_array_equal(scaler.mean_, [2])
        np.testing.assert_array_equal(scaler.scale_, [1])
        self.assertEqual(processor.transform(test.X)[0, 0], 9998)
        np.testing.assert_array_equal(scaler.mean_, [2])
        self.assertEqual(scaler.n_samples_seen_, 2)
        self.assertFalse(hasattr(clone(processor).named_steps["columns"], "transformers_"))

    def test_unseen_nominal_category_rejected_without_learning_it(self):
        train = prepare_regression_data([synthetic_record()], ("course_area",))
        record = synthetic_record()
        record["course_area"] = "Ciências Exatas"
        test = prepare_regression_data([record], ("course_area",))
        processor = build_regression_preprocessor(("course_area",))
        processor.fit(train.X)
        encoder = processor.named_steps["columns"].named_transformers_["categorical"]
        before = encoder.categories_[0].copy()
        with self.assertRaises(ValueError):
            processor.transform(test.X)
        np.testing.assert_array_equal(encoder.categories_[0], before)

    def test_x_defenses_against_leakage_and_bad_context(self):
        data = prepare_regression_data([synthetic_record()])
        processor = build_regression_preprocessor()
        for key in ("overall", "esbeu_01", "tcle_email"):
            modified = data.X.copy()
            modified[key] = 1
            with self.assertRaises(ValueError):
                processor.fit(modified)
        modified = data.X.copy()
        modified["sleep_hours"] = None
        with self.assertRaises(ResponseValidationError):
            processor.fit(modified)

    def test_no_input_mutation_and_feature_names_stable(self):
        record = synthetic_record()
        original = record.copy()
        data = prepare_regression_data([record])
        frame = data.X.copy(deep=True)
        processor = build_regression_preprocessor()
        processor.fit(data.X)
        names = processor.get_feature_names_out().copy()
        first = processor.transform(data.X)
        second = processor.transform(data.X)
        np.testing.assert_array_equal(first, second)
        np.testing.assert_array_equal(names, processor.get_feature_names_out())
        self.assertTrue(data.X.equals(frame))
        self.assertEqual(record, original)

    def test_importer_compatibility(self):
        mapping = {f"Synthetic {i}": f.identifier for i, f in enumerate(ANALYTICAL_FIELDS)}
        record = synthetic_record()
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(mapping)
        writer.writerow([record[key] for key in mapping.values()])
        stream.seek(0)
        imported = import_forms_csv(stream, mapping)
        data = prepare_regression_data(imported.records)
        self.assertEqual(data.y.tolist(), [0.0])
        self.assertEqual(build_regression_preprocessor().fit_transform(data.X).shape[0], 1)


if __name__ == "__main__":
    unittest.main()
