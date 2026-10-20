"""Only synthetic responses; no dataset, model training or participant access."""

import unittest
from collections import Counter
from dataclasses import FrozenInstanceError, replace

from training.form_schema import (
    ADMINISTRATIVE_FIELDS,
    ANALYTICAL_FIELDS,
    CONTEXT_FIELDS,
    ELIGIBILITY_FIELDS,
    ESBEU_BY_DIMENSION,
    ESBEU_FIELDS,
    FIELDS_BY_ID,
    Dimension,
    IneligibleRecordError,
    ResponseValidationError,
    SchemaDefinitionError,
    SpecialValue,
    is_eligible,
    validate_record,
    validate_schema,
    validate_value,
)


def synthetic_record():
    """An entirely fictitious, eligible canonical response."""
    return {
        field.identifier: field.choices[0] if field.choices else field.minimum
        for field in ANALYTICAL_FIELDS
    }


class SchemaTests(unittest.TestCase):
    def test_official_counts_and_unique_identifiers(self):
        self.assertEqual(len(ANALYTICAL_FIELDS), 39)
        self.assertEqual(len(ELIGIBILITY_FIELDS), 3)
        self.assertEqual(len(CONTEXT_FIELDS), 22)
        self.assertEqual(len(ESBEU_FIELDS), 14)
        self.assertEqual(len(FIELDS_BY_ID), 39)
        self.assertEqual({field.form_order for field in ANALYTICAL_FIELDS},
                         {1, 2, *range(4, 41)})
        validate_schema()

    def test_email_is_separate(self):
        self.assertEqual(len(ADMINISTRATIVE_FIELDS), 1)
        self.assertEqual(ADMINISTRATIVE_FIELDS[0].identifier, "tcle_email")
        self.assertEqual(ADMINISTRATIVE_FIELDS[0].form_order, 3)
        self.assertFalse(ADMINISTRATIVE_FIELDS[0].required)
        self.assertNotIn("tcle_email", FIELDS_BY_ID)

    def test_dimensions_and_exact_membership(self):
        self.assertEqual(Counter(field.dimension for field in ESBEU_FIELDS),
                        {Dimension.DEF: 6, Dimension.DIST: 4, Dimension.INEF: 4})
        for dimension, start, end in ((Dimension.DEF, 1, 7),
                                    (Dimension.DIST, 7, 11), (Dimension.INEF, 11, 15)):
            self.assertEqual(ESBEU_BY_DIMENSION[dimension],
                            tuple(f"esbeu_{i:02d}" for i in range(start, end)))
        for i, field in enumerate(ESBEU_FIELDS, 1):
            self.assertEqual(field.item_order, i)
            self.assertEqual(field.form_order, i + 26)
            self.assertFalse(field.reverse_scored)

    def test_immutable_definitions(self):
        with self.assertRaises(FrozenInstanceError):
            ESBEU_FIELDS[0].name = "changed"
        with self.assertRaises(TypeError):
            FIELDS_BY_ID["extra"] = ESBEU_FIELDS[0]

    def test_schema_rejects_definition_inconsistencies(self):
        invalid_schemas = [
            ANALYTICAL_FIELDS[:-1],
            ANALYTICAL_FIELDS + (ESBEU_FIELDS[0],),
            (ANALYTICAL_FIELDS[1],) + ANALYTICAL_FIELDS[1:],
        ]
        mutations = (
            {"form_order": 1}, {"required": False}, {"question": ""},
            {"choices": (0, 1)}, {"data_type": "category"},
            {"dimension": Dimension.DIST}, {"item_order": 15},
            {"reverse_scored": True}, {"group": "administrative"},
            {"labels": ("Never",)}, {"minimum": 4, "maximum": 0},
        )
        for changes in mutations:
            invalid_schemas.append(ANALYTICAL_FIELDS[:-1]
                                   + (replace(ESBEU_FIELDS[-1], **changes),))
        for fields in invalid_schemas:
            with self.subTest(fields=len(fields)):
                with self.assertRaises(SchemaDefinitionError):
                    validate_schema(fields)


class ResponseTests(unittest.TestCase):
    def test_all_declared_choices_and_boundaries_are_accepted(self):
        for field in ANALYTICAL_FIELDS:
            values = field.choices or tuple(
                value for value in (field.minimum, field.maximum) if value is not None
            )
            for value in values:
                with self.subTest(field=field.identifier, value=value):
                    self.assertEqual(validate_value(field.identifier, value), value)

    def test_every_esbeu_item_accepts_only_integers_zero_to_four(self):
        for field in ESBEU_FIELDS:
            for value in range(5):
                self.assertEqual(validate_value(field.identifier, value), value)
            for value in (-1, 5, 100, 0.0, 2.5, True, "0", "Nunca", None):
                with self.subTest(field=field.identifier, value=value):
                    with self.assertRaises(ResponseValidationError):
                        validate_value(field.identifier, value)

    def test_missing_and_wrong_types_for_all_fields(self):
        for field in ANALYTICAL_FIELDS:
            for value in (None, "", True, False, [], {}, object()):
                with self.subTest(field=field.identifier, value=type(value)):
                    with self.assertRaises(ResponseValidationError):
                        validate_value(field.identifier, value)

    def test_unknown_categories_and_numeric_boundaries(self):
        for field in ANALYTICAL_FIELDS:
            if field.data_type == "category":
                with self.assertRaises(ResponseValidationError):
                    validate_value(field.identifier, "unlisted alternative")
            if field.minimum is not None:
                with self.assertRaises(ResponseValidationError):
                    validate_value(field.identifier, field.minimum - 1)
            if field.maximum is not None:
                with self.assertRaises(ResponseValidationError):
                    validate_value(field.identifier, field.maximum + 1)

    def test_hours_accept_finite_decimals_without_string_coercion(self):
        for field in CONTEXT_FIELDS:
            if field.data_type != "number":
                continue
            self.assertEqual(validate_value(field.identifier, 7.5), 7.5)
            for value in (float("nan"), float("inf"), float("-inf"), "7,5", "7.5"):
                with self.assertRaises(ResponseValidationError):
                    validate_value(field.identifier, value)

    def test_na_is_explicit_and_field_specific(self):
        identifier = "study_work_difficulty"
        for value in (SpecialValue.NOT_APPLICABLE, "Não se aplica"):
            self.assertIs(validate_value(identifier, value), SpecialValue.NOT_APPLICABLE)
        self.assertEqual(validate_value(identifier, 0), 0)
        self.assertNotEqual(SpecialValue.NOT_APPLICABLE, 0)
        for field in ANALYTICAL_FIELDS:
            if field.identifier == identifier:
                continue
            for value in (SpecialValue.NOT_APPLICABLE, "Não se aplica"):
                with self.assertRaises(ResponseValidationError):
                    validate_value(field.identifier, value)
        for value in (None, -1, "N/A", "nan", "null", " Não se aplica "):
            with self.assertRaises(ResponseValidationError):
                validate_value(identifier, value)

    def test_complete_eligible_record_and_input_not_mutated(self):
        record = synthetic_record()
        record["study_work_difficulty"] = "Não se aplica"
        validated = validate_record(record)
        self.assertEqual(len(validated), 39)
        self.assertIs(validated["study_work_difficulty"], SpecialValue.NOT_APPLICABLE)
        self.assertEqual(record["study_work_difficulty"], "Não se aplica")
        self.assertTrue(is_eligible(record))

    def test_each_criterion_is_required_for_eligibility(self):
        for field in ELIGIBILITY_FIELDS:
            record = synthetic_record()
            record[field.identifier] = field.choices[1]
            self.assertFalse(is_eligible(record))
            with self.assertRaises(IneligibleRecordError):
                validate_record(record)
            del record[field.identifier]
            with self.assertRaises(ResponseValidationError):
                is_eligible(record)

    def test_every_required_field_missing_from_record_is_rejected(self):
        for field in ANALYTICAL_FIELDS:
            record = synthetic_record()
            del record[field.identifier]
            with self.assertRaises(ResponseValidationError):
                validate_record(record)

    def test_administrative_and_unknown_columns_are_rejected_without_echo(self):
        for key in ("tcle_email", ADMINISTRATIVE_FIELDS[0].question, "synthetic-secret-header"):
            record = synthetic_record()
            record[key] = "synthetic-secret-value"
            with self.assertRaises(ResponseValidationError) as caught:
                validate_record(record)
            self.assertNotIn(key, str(caught.exception))
            self.assertNotIn("synthetic-secret-value", str(caught.exception))
        with self.assertRaises(ResponseValidationError) as caught:
            validate_value("synthetic-secret-header", "synthetic-secret-value")
        self.assertNotIn("synthetic-secret", str(caught.exception))

    def test_work_hours_consistent_with_no_professional_activity(self):
        record = synthetic_record()
        record["work_hours_week"] = 1.5
        with self.assertRaisesRegex(ResponseValidationError, "work_hours_week"):
            validate_record(record)
        record["employment"] = "Sim, estágio"
        self.assertEqual(validate_record(record)["work_hours_week"], 1.5)
        # Current employment is not evidence of employment throughout the past four weeks.
        record["study_work_difficulty"] = "Não se aplica"
        self.assertIs(validate_record(record)["study_work_difficulty"],
                    SpecialValue.NOT_APPLICABLE)

    def test_errors_do_not_include_individual_values(self):
        with self.assertRaises(ResponseValidationError) as caught:
            validate_value("course_area", "synthetic-sensitive-response")
        self.assertEqual(caught.exception.field_id, "course_area")
        self.assertNotIn("synthetic-sensitive-response", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
