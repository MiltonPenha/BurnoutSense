"""Fictitious scale responses only; no research data or model execution."""

import unittest
from dataclasses import FrozenInstanceError, astuple

from training.esbeu_scoring import calculate_esbeu_scores
from training.form_schema import (
    ANALYTICAL_FIELDS,
    ESBEU_BY_DIMENSION,
    ESBEU_FIELDS,
    Dimension,
    ResponseValidationError,
    SpecialValue,
    validate_record,
    validate_value,
)


def synthetic_items(value=0):
    return {field.identifier: value for field in ESBEU_FIELDS}


class EsbeuScoringTests(unittest.TestCase):
    def test_all_zero(self):
        self.assertEqual(astuple(calculate_esbeu_scores(synthetic_items())),
                         (0.0, 0.0, 0.0, 0.0))

    def test_all_four(self):
        self.assertEqual(astuple(calculate_esbeu_scores(synthetic_items(4))),
                         (4.0, 4.0, 4.0, 4.0))

    def test_manually_checked_mixed_responses(self):
        # DEF sum 10; DIST sum 8; INEF sum 7; total 25 (14 items).
        answers = (0, 1, 2, 3, 4, 0, 1, 2, 3, 2, 4, 1, 0, 2)
        record = {f"esbeu_{i:02d}": value for i, value in enumerate(answers, 1)}
        scores = calculate_esbeu_scores(record)
        self.assertAlmostEqual(scores.overall, 25 / 14)
        self.assertAlmostEqual(scores.emotional_physical_exhaustion, 10 / 6)
        self.assertEqual(scores.distancing, 2.0)
        self.assertEqual(scores.training_inefficacy, 1.75)

    def test_overall_uses_items_not_unweighted_dimension_means(self):
        record = {f"esbeu_{i:02d}": 4 if i <= 6 else 0 for i in range(1, 15)}
        scores = calculate_esbeu_scores(record)
        self.assertAlmostEqual(scores.overall, 24 / 14)
        self.assertEqual(scores.emotional_physical_exhaustion, 4.0)
        self.assertEqual(scores.distancing, 0.0)
        self.assertEqual(scores.training_inefficacy, 0.0)
        self.assertNotAlmostEqual(scores.overall, 4 / 3)

    def test_each_item_contributes_to_only_its_canonical_dimension(self):
        attributes = {
            Dimension.DEF: "emotional_physical_exhaustion",
            Dimension.DIST: "distancing",
            Dimension.INEF: "training_inefficacy",
        }
        for field in ESBEU_FIELDS:
            with self.subTest(item=field.identifier):
                record = synthetic_items()
                record[field.identifier] = 1
                scores = calculate_esbeu_scores(record)
                self.assertAlmostEqual(scores.overall, 1 / 14)
                for dimension, items in ESBEU_BY_DIMENSION.items():
                    expected = 1 / len(items) if field.identifier in items else 0
                    self.assertAlmostEqual(getattr(scores, attributes[dimension]), expected)

    def test_each_missing_item_prevents_partial_scoring(self):
        for field in ESBEU_FIELDS:
            record = synthetic_items()
            del record[field.identifier]
            with self.subTest(item=field.identifier):
                with self.assertRaises(ResponseValidationError) as caught:
                    calculate_esbeu_scores(record)
                self.assertEqual(caught.exception.field_id, field.identifier)

    def test_empty_record_is_rejected(self):
        with self.assertRaises(ResponseValidationError):
            calculate_esbeu_scores({})

    def test_invalid_values_match_canonical_validator(self):
        invalid = (-1, 5, None, "2", "synthetic-invalid", True, False,
                   1.5, 2.0, float("nan"), float("inf"), [], {},
                   SpecialValue.NOT_APPLICABLE, "Não se aplica")
        for field in ESBEU_FIELDS:
            for value in invalid:
                with self.subTest(item=field.identifier, value=type(value)):
                    record = synthetic_items()
                    record[field.identifier] = value
                    with self.assertRaises(ResponseValidationError) as canonical:
                        validate_value(field.identifier, value)
                    with self.assertRaises(ResponseValidationError) as scoring:
                        calculate_esbeu_scores(record)
                    self.assertEqual(str(scoring.exception), str(canonical.exception))

    def test_all_valid_values_match_canonical_validator(self):
        for value in range(5):
            record = synthetic_items(value)
            for item in record:
                self.assertEqual(validate_value(item, value), value)
            self.assertEqual(astuple(calculate_esbeu_scores(record)), (float(value),) * 4)

    def test_result_is_immutable(self):
        scores = calculate_esbeu_scores(synthetic_items())
        with self.assertRaises(FrozenInstanceError):
            scores.overall = 4.0

    def test_input_is_unchanged(self):
        record = synthetic_items(2)
        original = record.copy()
        calculate_esbeu_scores(record)
        self.assertEqual(record, original)
        record["esbeu_14"] = "synthetic-invalid"
        original = record.copy()
        with self.assertRaises(ResponseValidationError):
            calculate_esbeu_scores(record)
        self.assertEqual(record, original)

    def test_full_validated_analytical_record_is_supported(self):
        record = {
            field.identifier: field.choices[0] if field.choices else field.minimum
            for field in ANALYTICAL_FIELDS
        }
        validated = validate_record(record)
        self.assertEqual(astuple(calculate_esbeu_scores(validated)), (0.0,) * 4)

    def test_extra_fields_are_neither_read_nor_returned(self):
        class ScaleOnlyMapping(dict):
            def get(self, key, default=None):
                if not key.startswith("esbeu_"):
                    raise AssertionError("Only scale items may be read")
                return super().get(key, default)

        record = ScaleOnlyMapping(synthetic_items(1))
        record["synthetic_extra"] = object()
        self.assertEqual(astuple(calculate_esbeu_scores(record)), (1.0,) * 4)

    def test_errors_do_not_echo_values(self):
        record = synthetic_items()
        record["esbeu_01"] = "synthetic-sensitive-text"
        with self.assertRaises(ResponseValidationError) as caught:
            calculate_esbeu_scores(record)
        self.assertNotIn("synthetic-sensitive-text", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
