"""Documented export format with entirely synthetic, in-memory responses."""

import csv
import io
import unittest

from training.esbeu_scoring import calculate_esbeu_scores
from training.form_schema import ANALYTICAL_FIELDS, ESBEU_FIELDS, SpecialValue
from training.import_forms import (
    FormsImportError, import_official_forms_csv, official_header_mapping,
)
from training.regression_preprocessing import prepare_regression_data


def synthetic_record():
    return {field.identifier: str(field.choices[0] if field.choices else field.minimum)
            for field in ANALYTICAL_FIELDS}


def synthetic_export(records, headers=None):
    mapping = official_header_mapping()
    if headers is None:
        headers = ["Carimbo de data/hora", *mapping]
        headers.insert(3, "E-mail para recebimento da cópia do TCLE")
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(headers)
    for record in records:
        writer.writerow([record[mapping[header]] if header in mapping
                         else "synthetic-excluded-marker" for header in headers])
    stream.seek(0)
    return stream


class OfficialFormsTests(unittest.TestCase):
    def test_mapping_numbering_and_literal_trailing_space(self):
        mapping = official_header_mapping()
        self.assertEqual(len(mapping), 39)
        self.assertEqual(len(set(mapping.values())), 39)
        self.assertEqual(mapping[
            "3. Atualmente você está matriculado(a) em um curso de graduação?"], "enrolled")
        self.assertEqual(mapping[
            "12. Em média, quantas horas por semana você dedica ao trabalho e/ou estágio? "],
            "work_hours_week")
        self.assertEqual(mapping[
            "25. Considerando as últimas 4 semanas, em que nível preocupações financeiras "
            "têm afetado sua rotina acadêmica?"], "financial_concern")
        for field in ESBEU_FIELDS:
            self.assertEqual(mapping[field.question], field.identifier)

    def test_official_41_columns_and_privacy(self):
        stream = synthetic_export([synthetic_record()])
        self.assertEqual(len(next(csv.reader(io.StringIO(stream.getvalue())))), 41)
        original = stream.getvalue()
        result = import_official_forms_csv(stream)
        self.assertEqual(result.eligible_count, 1)
        self.assertEqual(len(result.records[0]), 39)
        self.assertEqual(result.excluded_columns, (1, 4))
        self.assertNotIn("synthetic-excluded-marker", repr(result))
        self.assertEqual(stream.getvalue(), original)
        self.assertFalse(stream.closed)

    def test_numeric_labeled_and_decimal_alternatives(self):
        for value in range(5):
            record = synthetic_record()
            record.update(sleep_quality=str(value), sleep_hours="5,5",
                          independent_hours_week="5.5", mandatory_hours_week="8.0",
                          study_work_difficulty="2 — Moderadamente")
            for field in ESBEU_FIELDS:
                record[field.identifier] = f"{value} — {field.labels[value]}"
            result = import_official_forms_csv(synthetic_export([record]))
            self.assertEqual(result.eligible_count, 1)
            canonical = result.records[0]
            self.assertEqual(canonical["mandatory_hours_week"], 8.0)
            self.assertEqual(canonical["sleep_hours"], 5.5)
            self.assertEqual(canonical["independent_hours_week"], 5.5)
            self.assertEqual(canonical["study_work_difficulty"], 2)
            self.assertEqual(calculate_esbeu_scores(canonical).overall, value)

    def test_na_remains_distinct_from_zero(self):
        record = synthetic_record()
        record["study_work_difficulty"] = "Não se aplica"
        canonical = import_official_forms_csv(synthetic_export([record])).records[0]
        self.assertIs(canonical["study_work_difficulty"], SpecialValue.NOT_APPLICABLE)
        self.assertEqual(canonical["subject_overload"], 0)

    def test_stopped_participation_at_each_criterion(self):
        for prefix in ({"consent": "Não concordo em participar."},
                       {"consent": "Sim, concordo em participar.", "adult": "Não"},
                       {"consent": "Sim, concordo em participar.", "adult": "Sim",
                        "enrolled": "Não"}):
            record = dict.fromkeys(synthetic_record(), "")
            record.update(prefix)
            result = import_official_forms_csv(synthetic_export([record]))
            self.assertEqual((result.ineligible_count, result.rejected_count), (1, 0))
            self.assertEqual(result.records, ())

    def test_earlier_invalid_criterion_is_not_masked_by_later_denial(self):
        for key in ("consent", "adult"):
            record = synthetic_record()
            record[key] = ""
            record["enrolled"] = "Não"
            result = import_official_forms_csv(synthetic_export([record]))
            self.assertEqual((result.ineligible_count, result.rejected_count), (0, 1))
            self.assertEqual(result.issues[0].field_id, key)

    def test_positive_eligibility_still_requires_all_fields(self):
        for key, value in (("esbeu_14", ""), ("semester", ""),
                           ("consent", "synthetic-sensitive-invalid"),
                           ("esbeu_01", "2 — wrong"), ("sleep_hours", "invalid")):
            record = synthetic_record()
            record[key] = value
            result = import_official_forms_csv(synthetic_export([record]))
            self.assertEqual(result.rejected_count, 1)
            self.assertNotIn("synthetic-sensitive-invalid", repr(result))

    def test_header_drift_unknown_missing_and_duplicate(self):
        original = next(csv.reader(synthetic_export([])))
        cases = [original[:-1], original + ["synthetic-private-header"],
                 original + [original[0]]]
        work_header = next(h for h, key in official_header_mapping().items()
                           if key == "work_hours_week")
        cases.append([h.rstrip() if h == work_header else h for h in original])
        for headers in cases:
            with self.assertRaises(FormsImportError) as caught:
                import_official_forms_csv(synthetic_export([], headers))
            self.assertNotIn("synthetic-private-header", str(caught.exception))

    def test_independent_mixed_scores_and_regression_integration(self):
        record = synthetic_record()
        answers = (0, 1, 2, 3, 4, 0, 1, 2, 3, 2, 4, 1, 0, 2)
        for i, answer in enumerate(answers, 1):
            record[f"esbeu_{i:02d}"] = str(answer)
        result = import_official_forms_csv(synthetic_export([record]))
        scores = calculate_esbeu_scores(result.records[0])
        self.assertAlmostEqual(scores.overall, 25 / 14)
        self.assertAlmostEqual(scores.emotional_physical_exhaustion, 10 / 6)
        self.assertEqual(scores.distancing, 2)
        self.assertEqual(scores.training_inefficacy, 1.75)
        data = prepare_regression_data(result.records)
        self.assertEqual(data.X.shape, (1, 22))
        self.assertAlmostEqual(data.y.iloc[0], 25 / 14)
        self.assertFalse(any(key.startswith("esbeu_") for key in data.X.columns))

    def test_structural_row_error_precedes_refusal(self):
        stream = synthetic_export([])
        content = stream.getvalue() + '"synthetic-single-cell"\n'
        result = import_official_forms_csv(io.StringIO(content))
        self.assertEqual(result.rejected_count, 1)


if __name__ == "__main__":
    unittest.main()
