"""Synthetic executor tests; never open research inputs."""

from contextlib import redirect_stdout, redirect_stderr
from dataclasses import replace
import hashlib
import io
import json
import os
import random
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from test_optimization_v2 import GRID, PROTOCOL
from training.optimization_v2 import run_optimization_v2
from training.import_forms import import_official_forms_csv
from training.esbeu_scoring import calculate_esbeu_scores
from training.form_schema import ESBEU_FIELDS
from training.optimization_v2_validation import verify_optimization_v2
from training import run_optimization_v2 as runner


class SyntheticExecutorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get("BURNOUTSENSE_TEST_TMPDIR"))
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.source, self.output = self.root / "synthetic.csv", self.root / "out"

    def compact(self, data, **kwargs):
        return run_optimization_v2(data, protocol=PROTOCOL, candidates=GRID, **kwargs)

    def test_generated_input_is_official_and_deterministic(self):
        payload = runner.synthetic_csv_bytes()
        self.assertEqual(payload, runner.synthetic_csv_bytes())
        imported = import_official_forms_csv(io.StringIO(payload.decode("utf-8-sig")))
        self.assertEqual((imported.rows_read, imported.eligible_count), (30, 30))

    def test_varied_valid_items_and_scores_for_supported_counts(self):
        for count in (30, 31, 100):
            payload = runner.synthetic_csv_bytes(count)
            self.assertEqual(payload, runner.synthetic_csv_bytes(count))
            imported = import_official_forms_csv(io.StringIO(payload.decode("utf-8-sig")))
            self.assertEqual((imported.rows_read, imported.eligible_count,
                              imported.rejected_count, imported.ineligible_count), (count, count, 0, 0))
            scores = [calculate_esbeu_scores(record).overall for record in imported.records]
            self.assertGreater(len(set(scores)), 5)
            self.assertTrue(all(0 <= score <= 4 for score in scores))
            for record in imported.records:
                for field in ESBEU_FIELDS:
                    self.assertIs(type(record[field.identifier]), int)
                    self.assertIn(record[field.identifier], range(5))
            self.assertTrue(any(len({record[f.identifier] for f in ESBEU_FIELDS}) > 1
                                for record in imported.records))

    def test_targets_are_not_the_context_modulo_pattern(self):
        records = import_official_forms_csv(io.StringIO(
            runner.synthetic_csv_bytes().decode("utf-8-sig"))).records
        scores = [calculate_esbeu_scores(record).overall for record in records]
        self.assertNotEqual(scores, [i % 5 for i in range(len(records))])
        # Equal contextual ratings must not force an identical synthetic outcome.
        for rating in range(5):
            group = {score for record, score in zip(records, scores)
                     if record["subject_overload"] == rating}
            self.assertGreater(len(group), 1)

    def test_rng_is_local_and_count_extension_preserves_prefix(self):
        before = random.getstate()
        first = runner.synthetic_csv_bytes(30).splitlines()
        extended = runner.synthetic_csv_bytes(31).splitlines()
        self.assertEqual(first, extended[:len(first)])
        self.assertEqual(random.getstate(), before)

    def test_disabled_real_mode_never_opens_input(self):
        with patch.object(runner, "_destinations") as paths:
            with self.assertRaisesRegex(runner.RunnerError, "REAL_DATA_EXECUTION_DISABLED"):
                runner.run_synthetic_demo(self.source, self.output)
            paths.assert_not_called()
        self.assertFalse(self.source.exists())

    def test_existing_input_is_not_opened_or_overwritten(self):
        self.source.write_text("synthetic-private-sentinel", encoding="utf-8")
        with patch.object(runner, "_provenance") as provenance:
            with self.assertRaisesRegex(runner.RunnerError, "DESTINATION_ALREADY_EXISTS"):
                runner.run_synthetic_demo(self.source, self.output, synthetic_demo=True)
            provenance.assert_not_called()
        self.assertEqual(self.source.read_text(encoding="utf-8"), "synthetic-private-sentinel")
        self.assertFalse(self.output.exists())

    def test_existing_output_no_input_created(self):
        self.output.mkdir()
        with self.assertRaises(runner.RunnerError):
            runner.run_synthetic_demo(self.source, self.output, synthetic_demo=True)
        self.assertFalse(self.source.exists())

    def test_repository_paths_and_nested_destinations_rejected(self):
        for source, output in ((runner.REPOSITORY / "never-create.csv", self.output),
                               (self.source, runner.REPOSITORY / "never-create"),
                               (self.source, self.source),
                               (self.output / "in.csv", self.output)):
            with self.assertRaises(runner.RunnerError):
                runner.run_synthetic_demo(source, output, synthetic_demo=True)

    def test_manifest_hash_and_aggregate_outputs(self):
        with patch.object(runner, "run_optimization_v2", side_effect=self.compact):
            result = runner.run_synthetic_demo(self.source, self.output, synthetic_demo=True)
        self.assertTrue(result.complete)
        self.assertEqual({p.name for p in self.output.iterdir()},
                         {"report.aggregate.json", "verification.json", "manifest.json"})
        manifest = json.loads((self.output / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["input_sha256"], hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.assertFalse(manifest["real_data_enabled"])
        self.assertFalse(manifest["scientific_result"])
        self.assertEqual(len(manifest["git_commit"]), 40)
        self.assertIn("scikit-learn", manifest["libraries"])
        self.assertTrue(manifest["source_sha256"])
        self.assertEqual(manifest["synthetic_generator"]["version"], runner.SYNTHETIC_GENERATOR_VERSION)
        report = json.loads((self.output / "report.aggregate.json").read_text(encoding="utf-8"))
        self.assertTrue(verify_optimization_v2(report).complete)
        for file in self.output.iterdir():
            content = file.read_text(encoding="utf-8")
            for marker in ('"predictions"', '"records"', '"y_true"', "SYNTHETIC_ONLY", str(self.root)):
                self.assertNotIn(marker, content)
        with self.assertRaises(runner.RunnerError):
            runner.run_synthetic_demo(self.source, self.output, synthetic_demo=True)

    def test_incomplete_report_diagnostics_are_saved(self):
        original = runner.verify_optimization_v2
        with patch.object(runner, "run_optimization_v2", side_effect=self.compact), patch.object(
                runner, "verify_optimization_v2",
                side_effect=lambda report: replace(original(report), complete=False, issues=("synthetic_failure",))):
            verification = runner.run_synthetic_demo(self.source, self.output, synthetic_demo=True)
        self.assertFalse(verification.complete)
        stored = json.loads((self.output / "verification.json").read_text(encoding="utf-8"))
        self.assertEqual(stored["issues"], ["synthetic_failure"])
        manifest = json.loads((self.output / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["status"], "incomplete")

    def test_cli_errors_are_sanitized(self):
        output = io.StringIO()
        with redirect_stdout(output), redirect_stderr(output):
            code = runner.main(["--input", str(self.source), "--output", str(self.output)])
        self.assertEqual(code, 2)
        self.assertEqual(output.getvalue().strip(), "REAL_DATA_EXECUTION_DISABLED")
        self.assertNotIn(str(self.root), output.getvalue())

    def test_invalid_count_does_not_create_files(self):
        with self.assertRaises(runner.RunnerError):
            runner.run_synthetic_demo(self.source, self.output, synthetic_demo=True, records=1)
        self.assertFalse(self.source.exists())
        self.assertFalse(self.output.exists())

    def test_argument_errors_do_not_echo_values(self):
        output = io.StringIO()
        with redirect_stdout(output), redirect_stderr(output):
            code = runner.main(["--records", "synthetic-sensitive-argument"])
        self.assertEqual(code, 2)
        self.assertEqual(output.getvalue().strip(), "INVALID_ARGUMENTS")

    def test_symlink_destinations_rejected(self):
        with patch.object(Path, "is_symlink", return_value=True):
            with self.assertRaisesRegex(runner.RunnerError, "SYMLINK_DESTINATION_REJECTED"):
                runner.run_synthetic_demo(self.source, self.output, synthetic_demo=True)


if __name__ == "__main__":
    unittest.main()
