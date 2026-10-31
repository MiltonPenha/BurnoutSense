"""Final-stage checks use generated fixtures only, not participant records."""

from copy import deepcopy
from dataclasses import asdict
import json
import math
from pathlib import Path
import unittest
from unittest.mock import patch

from test_research_training import official_stream, records, temporary_directory
from training.form_schema import ANALYTICAL_FIELDS, FIELDS_BY_ID
from training.regression_models import MODEL_NAMES
from training.research_finalization import (
    FinalizationError, audit_final_dataset, verify_final_experiment,
)


def summary(name, folds):
    result = {"name": name}
    for metric in ("mae", "rmse", "r2"):
        values = [fold["metrics"][metric] for fold in folds if fold["metrics"][metric] is not None]
        average = sum(values) / len(values) if values else None
        deviation = math.sqrt(sum((value - average) ** 2 for value in values) / (len(values) - 1)) \
            if len(values) > 1 else None
        result[metric] = {"mean": average, "std": deviation, "valid_folds": len(values),
                          "undefined_folds": len(folds) - len(values), "failed_folds": 0}
    return result


def artificial_report():
    errors = {"dummy": (1.0, 3.0), "linear": (2.0, 4.0), "ridge": (0.5, 2.5),
              "random_forest": (0.25, 2.75), "svr": (1.0, 2.0)}
    candidates = [{"name": name, "parameters": [["alpha", 10.0]] if name == "ridge" else []}
                  for name in MODEL_NAMES]
    folds, summaries = [], []
    for candidate in candidates:
        current = []
        for number, error in enumerate(errors[candidate["name"]], 1):
            current.append({"repeat": 1, "fold": number, "name": candidate["name"],
                            "train_size": 4, "test_size": 4, "candidate": candidate,
                            "inner_mae": 0.1 if candidate["name"] == "ridge" else 1.0,
                            "metrics": {"mae": error, "rmse": error, "r2": -error,
                                        "r2_undefined_reason": None},
                            "failure": None, "warning_codes": [], "inner_failed_candidates": 0})
        folds.extend(current)
        summaries.append(summary(candidate["name"], current))
    selected = deepcopy([fold for fold in folds if fold["name"] == "ridge"])
    scores = [{"candidate": c, "mae": 0.1 if c["name"] == "ridge" else 1.0,
               "rmse": 1.0, "mae_std": 0.0, "failed_folds": 0,
               "failure_codes": [], "warning_codes": []} for c in candidates]
    return {"protocol": {"outer_splits": 2, "inner_splits": 2, "outer_repeats": 1,
                         "random_state": 42}, "n_samples": 8, "candidates": candidates,
            "family_folds": folds, "family_summaries": summaries,
            "selection_folds": selected, "selection_summary": summary("inner_selection_procedure", selected),
            "final_inner_scores": scores, "final_candidate": candidates[2],
            "final_refit_failure": None, "final_warning_codes": []}


class FinalAuditTests(unittest.TestCase):
    def audit(self, source_records):
        with temporary_directory() as directory:
            path = Path(directory) / "artificial-only.csv"
            path.write_text(official_stream(source_records).getvalue(), encoding="utf-8", newline="")
            return audit_final_dataset(path)

    def test_missingness_covers_all_eligible_raw_cells_and_respects_stopped_rows(self):
        source = records(4)
        source[1]["sleep_hours"] = ""
        source[1]["esbeu_01"] = "  "
        source[2] = dict.fromkeys(source[2], "")
        source[2]["consent"] = "Não concordo em participar."
        source[3] = dict.fromkeys(source[3], "")
        source[3]["consent"] = "Sim, concordo em participar."
        result = self.audit(source)
        missing = result.missingness
        self.assertEqual((result.base.eligible, result.base.ineligible, result.base.rejected), (1, 1, 2))
        self.assertEqual((missing.positive_eligibility_rows_audited, missing.rows_skipped_for_eligibility), (2, 2))
        self.assertEqual((missing.rows_with_missing_analytical_cells, missing.missing_analytical_cells), (1, 2))
        self.assertEqual(dict(missing.missing_by_field)["sleep_hours"], 1)
        self.assertEqual(dict(missing.missing_by_field)["esbeu_01"], 1)
        self.assertEqual(len(missing.missing_by_field), 39)

    def test_zero_na_and_admin_content_are_not_missing(self):
        result = self.audit(records(6))
        self.assertEqual(result.missingness.missing_analytical_cells, 0)
        self.assertNotIn("synthetic-excluded", repr(result))
        self.assertNotIn("records", asdict(result))
        self.assertEqual(result.base.transformed_columns, 40)

    def test_all_finite_context_domains_include_ordinal_coverage(self):
        source = records(3)
        source[1]["age_range"] = FIELDS_BY_ID["age_range"].choices[-1]
        result = self.audit(source)
        age = next(c for c in result.finite_category_coverage if c.field == "age_range")
        self.assertEqual((age.schema_levels, age.observed_levels, age.absent_schema_levels), (6, 2, 4))
        self.assertEqual(age.observed_levels_below_five, 2)
        self.assertEqual(len(result.finite_category_coverage), 16)

    def test_outcome_quantiles_and_std_are_independently_known(self):
        source = records(3)
        for record, value in zip(source, (0, 2, 4)):
            for field in ANALYTICAL_FIELDS:
                if field.group == "esbeu":
                    record[field.identifier] = value
        result = self.audit(source)
        for distribution in result.outcome_distributions:
            self.assertEqual((distribution.mean, distribution.std, distribution.q25,
                              distribution.median, distribution.q75), (2, 2, 1, 2, 3))

    def test_changed_source_and_invalid_header_are_sanitized(self):
        with temporary_directory() as directory:
            path = Path(directory) / "artificial.csv"
            path.write_text(official_stream(records(2)).getvalue(), encoding="utf-8", newline="")
            with patch("training.research_finalization.file_sha256", side_effect=["a" * 64, "b" * 64]):
                with self.assertRaises(FinalizationError) as caught:
                    audit_final_dataset(path)
                self.assertIsNone(caught.exception.__context__)
            path.write_text("synthetic-private-header\n", encoding="utf-8")
            with self.assertRaises(FinalizationError) as caught:
                audit_final_dataset(path)
            self.assertNotIn("synthetic-private", str(caught.exception))


class FinalResultVerificationTests(unittest.TestCase):
    def test_aggregate_recalculation_and_paired_baseline_differences(self):
        report = artificial_report()
        before = deepcopy(report)
        result = verify_final_experiment(report)
        self.assertEqual(report, before)
        ridge = next(p for p in result["paired_dummy_comparisons"] if p["name"] == "ridge")
        self.assertEqual((ridge["mae_improvement_over_dummy_mean"], ridge["mae_improvement_over_dummy_std"]), (0.5, 0))
        self.assertEqual((ridge["folds_better_than_dummy"], ridge["folds_worse_than_dummy"]), (2, 0))
        self.assertTrue(result["all_aggregates_verified"])
        self.assertFalse(result["independent_external_validation"])
        self.assertNotIn("indices", json.dumps(result))
        json.dumps(result, allow_nan=False)

    def test_tampered_aggregate_and_incomplete_folds_refused(self):
        variants = []
        report = artificial_report()
        report["family_summaries"][0]["mae"]["mean"] += 0.01
        variants.append(report)
        report = artificial_report()
        report["family_folds"].pop()
        variants.append(report)
        report = artificial_report()
        report["family_folds"][0]["test_size"] = 3
        variants.append(report)
        report = artificial_report()
        report["family_folds"][0]["failure"] = "synthetic-private"
        variants.append(report)
        report = artificial_report()
        report["final_refit_failure"] = "synthetic-private"
        variants.append(report)
        for variant in variants:
            with self.assertRaises(FinalizationError) as caught:
                verify_final_experiment(variant)
            self.assertNotIn("synthetic-private", str(caught.exception))
            self.assertIsNone(caught.exception.__context__)

    def test_final_model_cannot_be_replaced_by_external_winner(self):
        report = artificial_report()
        report["final_candidate"] = report["candidates"][3]
        with self.assertRaises(FinalizationError):
            verify_final_experiment(report)

    def test_outer_selection_must_match_saved_family_and_inner_minimum(self):
        report = artificial_report()
        report["selection_folds"][0] = deepcopy(report["family_folds"][6])
        with self.assertRaises(FinalizationError):
            verify_final_experiment(report)


if __name__ == "__main__":
    unittest.main()
