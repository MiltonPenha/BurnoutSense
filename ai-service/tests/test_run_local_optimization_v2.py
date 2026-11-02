"""Entirely fictitious CSVs; never reads the configured private input."""
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from training.run_optimization_v2 import synthetic_csv_bytes
from training.import_forms import official_header_mapping
from training import run_local_optimization_v2 as local
from test_private_v2_contracts import fake_report


def changed(edits=(), duplicate=False):
    rows = list(csv.reader(io.StringIO(synthetic_csv_bytes(39).decode("utf-8-sig"))))
    columns = {key: rows[0].index(header) for header, key in official_header_mapping().items()}
    for row, key, value in edits:
        rows[row][columns[key]] = value
    if duplicate:
        rows[2] = rows[1].copy()
    stream = io.StringIO(newline="")
    csv.writer(stream).writerows(rows)
    return stream.getvalue().encode("utf-8-sig")


class LocalInspectionTests(unittest.TestCase):
    def test_valid_varied_scale_and_predictors(self):
        summary, data = local.inspect_bytes(synthetic_csv_bytes(36))
        self.assertEqual(summary["counts"], dict(rows_read=36, eligible=36, ineligible=0, rejected=0))
        self.assertEqual(tuple(data.X.columns), local.ALLOWED_PREDICTORS)
        self.assertTrue(data.y.between(0, 4).all())
        self.assertGreater(summary["target"]["unique_values"], 1)
        self.assertEqual(sum(summary["target"]["histogram"].values()), 36)
        self.assertEqual(summary["official_header_count"], 41)
        self.assertEqual(summary["administrative_columns_excluded"], 2)
        self.assertTrue(summary["computationally_adequate"])

    def test_exclusions_match_official_order(self):
        summary, _ = local.inspect_bytes(changed([(1, "consent", "Não concordo em participar."),
            (2, "adult", "Não"), (3, "enrolled", "Não")]))
        self.assertEqual(summary["counts"]["eligible"], 36)
        self.assertEqual(summary["excluded_first_negative_criterion"], dict(consent=1, adult=1, enrolled=1))

    def test_missing_outcome_rejected_without_imputation(self):
        summary, data = local.inspect_bytes(changed([(1, "esbeu_01", "")]))
        self.assertEqual(summary["counts"]["rejected"], 1)
        self.assertEqual(summary["rejected_first_issue"], {"missing_required": 1})
        self.assertEqual(summary["missing_esbeu_cells_all_rows"], 1)
        self.assertEqual(len(data.y), 38)

    def test_invalid_scale_rejected_and_not_echoed(self):
        summary, _ = local.inspect_bytes(changed([(1, "esbeu_01", "FICTIONAL_PRIVATE_SENTINEL")]))
        self.assertEqual(summary["counts"]["rejected"], 1)
        self.assertNotIn("FICTIONAL_PRIVATE_SENTINEL", json.dumps(summary))

    def test_duplicate_profiles_require_review_not_deduplication(self):
        summary, data = local.inspect_bytes(changed(duplicate=True))
        self.assertFalse(summary["computationally_adequate"])
        self.assertEqual(summary["identical_analytical_profiles_excess"], 1)
        self.assertEqual(len(data.y), 39)

    def test_constant_target_is_explicit(self):
        edits = [(i, f"esbeu_{j:02d}", "2") for i in range(1, 40) for j in range(1, 15)]
        summary, _ = local.inspect_bytes(changed(edits))
        self.assertFalse(summary["computationally_adequate"])
        self.assertEqual(summary["target"]["std"], 0)

    def test_reproducible_aggregate_without_administrative_values(self):
        payload = synthetic_csv_bytes(36)
        a, _ = local.inspect_bytes(payload)
        b, _ = local.inspect_bytes(payload)
        self.assertEqual(a, b)
        for forbidden in ("SYNTHETIC_ONLY", "train_indices", "test_indices", "predictions", '"records":'):
            self.assertNotIn(forbidden, json.dumps(a))

    def test_local_flow_inspection_and_frozen_evaluation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            source = root / "fiction.csv"
            payload = synthetic_csv_bytes(36)
            source.write_bytes(payload)
            with patch.object(local, "PRIVATE_ROOT", root), patch.object(local, "CONTROLLED_INPUT", source), \
                    patch.object(local, "_private_permissions"), patch.object(local, "_load", return_value=({}, payload)), \
                    patch.object(local, "describe_runtime", return_value={}):
                with patch.object(local, "run_optimization_v2") as fit:
                    summary, status = local.run_local(root / "inspection")
                    fit.assert_not_called()
                    self.assertEqual(status, "inspected_no_training")
                    with self.assertRaises(ValueError):
                        local.run_local(root / "inspection")
                    with self.assertRaises(ValueError):
                        local.run_local(root / "wrong-hash", evaluate=True, expected_input_sha256="0" * 64)
                report = fake_report()
                report["data_origin"] = "real_authorized"
                with patch.object(local, "run_optimization_v2", return_value=report) as fit:
                    _, status = local.run_local(root / "evaluation", evaluate=True,
                        expected_input_sha256=summary["input_sha256"])
                    self.assertEqual(status, "technically_complete")
                    self.assertEqual(fit.call_args.kwargs["protocol"], local.ExperimentProtocol())
                artifacts = "".join(p.read_text(encoding="utf-8") for p in (root / "evaluation").iterdir())
                self.assertNotIn("SYNTHETIC_ONLY", artifacts)


if __name__ == "__main__":
    unittest.main()
