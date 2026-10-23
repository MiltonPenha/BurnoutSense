"""All CSV content is fictitious and generated in memory."""

import csv
import io
import unittest
from dataclasses import FrozenInstanceError
from unittest.mock import mock_open, patch

from training.form_schema import ANALYTICAL_FIELDS, SpecialValue
from training.import_forms import FormsImportError, import_forms_csv


MAPPING = {f"Synthetic question {i}": field.identifier
           for i, field in enumerate(ANALYTICAL_FIELDS, 1)}


def synthetic_record():
    return {field.identifier: str(field.choices[0] if field.choices else field.minimum)
            for field in ANALYTICAL_FIELDS}


def synthetic_csv(records=(), extras=(), delimiter=","):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, delimiter=delimiter)
    writer.writerow([*MAPPING, *extras])
    for record in records:
        writer.writerow([record[key] for key in MAPPING.values()] + ["excluded-text"] * len(extras))
    stream.seek(0)
    return stream


class ImportFormsTests(unittest.TestCase):
    def test_complete_csv_and_explicit_noncanonical_headers(self):
        result = import_forms_csv(synthetic_csv([synthetic_record()]), MAPPING)
        self.assertEqual((result.rows_read, result.eligible_count,
                          result.ineligible_count, result.rejected_count), (1, 1, 0, 0))
        self.assertEqual(set(result.records[0]), set(MAPPING.values()))
        self.assertEqual(result.records[0]["semester"], 1)

    def test_all_scale_values(self):
        for value in range(5):
            record = synthetic_record()
            record.update({f"esbeu_{i:02d}": str(value) for i in range(1, 15)})
            self.assertEqual(import_forms_csv(synthetic_csv([record]), MAPPING).eligible_count, 1)

    def test_numeric_categories_and_special_alternatives(self):
        record = synthetic_record()
        record.update(sleep_hours="7,5", mandatory_hours_week="7.5",
                      study_work_difficulty="Não se aplica", esbeu_01="2 — Às vezes")
        result = import_forms_csv(synthetic_csv([record]), MAPPING).records[0]
        self.assertEqual(result["sleep_hours"], 7.5)
        self.assertEqual(result["mandatory_hours_week"], 7.5)
        self.assertEqual(result["physical_activity_days"], "0 dias")
        self.assertEqual(result["esbeu_01"], 2)
        self.assertIs(result["study_work_difficulty"], SpecialValue.NOT_APPLICABLE)

    def test_invalid_cells_and_no_partial_import(self):
        cases = (("esbeu_01", "-1"), ("esbeu_01", "5"), ("esbeu_01", "2.0"),
                 ("esbeu_01", "True"), ("esbeu_01", "2 — wrong"),
                 ("esbeu_01", "Não se aplica"), ("semester", ""),
                 ("sleep_hours", "NaN"), ("sleep_hours", "1,2.3"),
                 ("course_area", "unknown"), ("consent", "invalid-consent"))
        for identifier, value in cases:
            with self.subTest(identifier=identifier, value=value):
                record = synthetic_record()
                record[identifier] = value
                result = import_forms_csv(synthetic_csv([record]), MAPPING)
                self.assertEqual(result.rejected_count, 1)
                self.assertEqual(result.records, ())
                self.assertEqual(result.issues[0].field_id, identifier)

    def test_missing_header(self):
        stream = synthetic_csv()
        stream = io.StringIO(stream.getvalue().replace("Synthetic question 1,", "", 1))
        with self.assertRaises(FormsImportError):
            import_forms_csv(stream, MAPPING)

    def test_duplicate_headers(self):
        stream = synthetic_csv(extras=(next(iter(MAPPING)),))
        with self.assertRaises(FormsImportError):
            import_forms_csv(stream, MAPPING)

    def test_ambiguous_or_incomplete_mappings(self):
        pairs = list(MAPPING.items())
        cases = (pairs + [pairs[0]], pairs[:-1],
                 pairs + [("extra", pairs[0][1])],
                 pairs + [(pairs[0][0], "not-canonical")],
                 [("tcle_email", pairs[0][1])] + pairs[1:],
                 [("", pairs[0][1])] + pairs[1:], [(1, "consent")])
        for mapping in cases:
            with self.assertRaises(FormsImportError):
                import_forms_csv(synthetic_csv(), mapping)

    def test_all_extra_columns_excluded_without_names_or_values(self):
        result = import_forms_csv(synthetic_csv([synthetic_record()],
                                  extras=("tcle_email", "timestamp", "synthetic-private")), MAPPING)
        self.assertEqual(result.excluded_columns, (40, 41, 42))
        self.assertEqual(len(result.records[0]), 39)
        self.assertNotIn("excluded-text", repr(result))
        self.assertNotIn("synthetic-private", repr(result))

    def test_ineligible_is_distinct_from_invalid(self):
        for key, value in (("consent", "Não concordo em participar."),
                           ("adult", "Não"), ("enrolled", "Não")):
            record = synthetic_record()
            record[key] = value
            result = import_forms_csv(synthetic_csv([record]), MAPPING)
            self.assertEqual((result.ineligible_count, result.rejected_count), (1, 0))
            self.assertEqual(result.records, ())
            record["esbeu_01"] = ""
            result = import_forms_csv(synthetic_csv([record]), MAPPING)
            self.assertEqual((result.ineligible_count, result.rejected_count), (0, 1))

    def test_empty_and_header_only(self):
        with self.assertRaises(FormsImportError):
            import_forms_csv(io.StringIO(""), MAPPING)
        result = import_forms_csv(synthetic_csv(), MAPPING)
        self.assertEqual(result.rows_read, 0)

    def test_delimiter_configuration(self):
        stream = synthetic_csv([synthetic_record()], delimiter=";")
        self.assertEqual(import_forms_csv(stream, MAPPING, delimiter=";").eligible_count, 1)
        stream.seek(0)
        with self.assertRaises(FormsImportError):
            import_forms_csv(stream, MAPPING)
        for delimiter in ("", "xx", "\n", '"'):
            with self.assertRaises(FormsImportError):
                import_forms_csv(synthetic_csv(), MAPPING, delimiter=delimiter)

    def test_decode_failure_is_sanitized_including_exception_context(self):
        stream = io.TextIOWrapper(io.BytesIO(b"synthetic-private\xff"), encoding="utf-8")
        with self.assertRaises(FormsImportError) as caught:
            import_forms_csv(stream, MAPPING)
        self.assertIsNone(caught.exception.__context__)
        self.assertNotIn("synthetic-private", str(caught.exception))

    def test_path_read_only_and_encoding(self):
        content = synthetic_csv([synthetic_record()]).getvalue()
        opener = mock_open(read_data=content)
        with patch("training.import_forms.open", opener):
            self.assertEqual(import_forms_csv("synthetic.csv", MAPPING).eligible_count, 1)
        opener.assert_called_once_with("synthetic.csv", encoding="utf-8-sig", newline="")

    def test_multiple_rows_preserve_order_and_counts(self):
        first, invalid, ineligible, last = [synthetic_record() for _ in range(4)]
        first["semester"] = "2"
        invalid["esbeu_01"] = "99"
        ineligible["adult"] = "Não"
        last["semester"] = "8"
        result = import_forms_csv(synthetic_csv([first, invalid, ineligible, last]), MAPPING)
        self.assertEqual((result.rows_read, result.eligible_count,
                          result.ineligible_count, result.rejected_count), (4, 2, 1, 1))
        self.assertEqual([r["semester"] for r in result.records], [2, 8])
        self.assertEqual([issue.row for issue in result.issues], [3, 4])

    def test_source_and_results_preserved(self):
        stream = synthetic_csv([synthetic_record()])
        original = stream.getvalue()
        result = import_forms_csv(stream, MAPPING)
        self.assertEqual(stream.getvalue(), original)
        self.assertFalse(stream.closed)
        with self.assertRaises(FrozenInstanceError):
            result.rows_read = 0
        with self.assertRaises(TypeError):
            result.records[0]["semester"] = 5

    def test_bad_row_width_and_malformed_csv(self):
        stream = synthetic_csv()
        stream = io.StringIO(stream.getvalue() + "only-one-cell\n")
        result = import_forms_csv(stream, MAPPING)
        self.assertEqual(result.rejected_count, 1)
        with self.assertRaises(FormsImportError):
            import_forms_csv(io.StringIO(synthetic_csv().getvalue() + '"unclosed'), MAPPING)

    def test_error_messages_never_contain_raw_content(self):
        record = synthetic_record()
        record["course_area"] = "synthetic-private-value"
        result = import_forms_csv(synthetic_csv([record]), MAPPING)
        self.assertNotIn("synthetic-private-value", repr(result))

    def test_literal_multiline_headers_and_reordered_columns(self):
        mapping = {f"{i}. Pergunta sintética\ncom acento?": identifier
                   for i, identifier in enumerate(reversed(list(MAPPING.values())), 1)}
        record = synthetic_record()
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(mapping)
        writer.writerow([record[identifier] for identifier in mapping.values()])
        stream.seek(0)
        self.assertEqual(import_forms_csv(stream, mapping).eligible_count, 1)


if __name__ == "__main__":
    unittest.main()
