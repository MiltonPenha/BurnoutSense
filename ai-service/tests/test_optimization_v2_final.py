"""Full synthetic protocol and read-only report integrity checks."""

from copy import deepcopy
import json
import unittest
from unittest.mock import patch

from sklearn.model_selection import KFold

from test_optimization_v2 import GRID, PROTOCOL, synthetic_data
from training import optimization_v2 as v2
from training.optimization_v2_validation import verify_optimization_v2


class V2VerificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = v2.run_optimization_v2(synthetic_data(), protocol=PROTOCOL, candidates=GRID)

    def test_valid_json_roundtrip_and_no_mutation(self):
        report = json.loads(json.dumps(self.report, allow_nan=False))
        before = deepcopy(report)
        verification = verify_optimization_v2(report)
        self.assertTrue(verification.complete, verification.issues)
        self.assertTrue(verification.requires_human_review)
        self.assertEqual(report, before)

    def test_corruption_fails_closed_and_preserves_diagnostics(self):
        def missing(r):
            r["comparisons"]["A/ridge"]["folds"].pop()

        def failed(r):
            r["selection"]["folds"][0]["failure"] = "fit_failed"

        def invalid_metric(r):
            r["comparisons"]["A/dummy"]["folds"][0]["metrics"]["mae"] = -1

        def incomplete(r):
            del r["comparisons"]["C/svr"]

        def frequency(r):
            r["subset_frequency"]["A"] += 1

        def candidate(r):
            r["candidates"][0]["subset"] = "forbidden"

        def summary(r):
            r["selection"]["summary"]["mae"]["mean"] = 99

        def internal(r):
            r["inner_audit"][0]["scores"][0]["failed_folds"] = 1

        def duplicate(r):
            r["inner_audit"][1] = deepcopy(r["inner_audit"][0])

        def changed_choice(r):
            r["selection"]["folds"][0]["candidate"] = r["candidates"][0]
            r["selection"]["folds"][0]["metrics"]["mae"] += 0.1

        for mutation in (missing, failed, invalid_metric, incomplete, frequency,
                         candidate, summary, internal, duplicate, changed_choice):
            with self.subTest(mutation=mutation.__name__):
                report = deepcopy(self.report)
                mutation(report)
                before = deepcopy(report)
                verification = verify_optimization_v2(report)
                self.assertFalse(verification.complete)
                self.assertTrue(verification.issues)
                self.assertEqual(report, before)

    def test_real_origin_label_never_supplies_authorization(self):
        report = deepcopy(self.report)
        report["data_origin"] = "real_authorized"
        result = verify_optimization_v2(report)
        self.assertTrue(result.requires_human_review)
        self.assertFalse(hasattr(result, "scientifically_approved"))
        self.assertFalse(hasattr(result, "authorized"))


class FullSyntheticV2IntegrationTests(unittest.TestCase):
    def test_full_default_protocol_twice_with_partition_isolation(self):
        data = synthetic_data(30)
        original_X, original_y = data.X.copy(deep=True), data.y.copy(deep=True)
        original_tune, original_trial = v2._tune, v2._trial

        def execute():
            expected = []
            for repeat in range(3):
                expected.extend(KFold(5, shuffle=True, random_state=42 + repeat).split(data.X))
            seen = []
            current = {}
            trial_count = [0]

            def tune(grid, X, y, partitions, seed):
                train, test = expected[len(seen)]
                self.assertEqual(set(X.index), set(train))
                self.assertEqual(set(y.index), set(train))
                self.assertTrue(set(X.index).isdisjoint(test))
                self.assertEqual(len(partitions), 3)
                self.assertEqual(len(grid), 21)
                current.update(train=set(train), test=set(test))
                seen.append(len(X))
                return original_tune(grid, X, y, partitions, seed)

            def trial(candidate, X, y, train, test, seed):
                self.assertTrue(set(train).isdisjoint(test))
                self.assertEqual(set(train) | set(test), set(range(len(X))))
                if len(X) == 30:
                    self.assertEqual(set(X.iloc[train].index), current["train"])
                    self.assertEqual(set(X.iloc[test].index), current["test"])
                else:
                    self.assertEqual(set(X.index), current["train"])
                    self.assertTrue(set(X.iloc[test].index).isdisjoint(current["test"]))
                trial_count[0] += 1
                return original_trial(candidate, X, y, train, test, seed)

            with patch.object(v2, "_tune", side_effect=tune), patch.object(
                    v2, "_trial", side_effect=trial):
                report = v2.run_optimization_v2(data)
            self.assertEqual(len(seen), 15)
            self.assertEqual(trial_count[0], 15 * (21 * 3 + 12))
            verification = verify_optimization_v2(report)
            self.assertTrue(verification.complete, verification.issues)
            for comparison in [*report["comparisons"].values(), report["selection"]]:
                self.assertEqual(len(comparison["folds"]), 15)
                self.assertEqual(comparison["summary"]["mae"]["valid_folds"], 15)
                self.assertEqual(comparison["summary"]["mae"]["failed_folds"], 0)
            self.assertEqual(sum(report["subset_frequency"].values()), 15)
            self.assertEqual(sum(report["model_frequency"].values()), 15)
            self.assertEqual(sum(c["count"] for c in report["candidate_frequency"]), 15)
            text = json.dumps(report, allow_nan=False)
            for forbidden in ('"records"', '"predictions"', '"y_true"', '"row_id"',
                              '"train_indices"', '"test_indices"'):
                self.assertNotIn(forbidden, text)
            return report

        first, second = execute(), execute()
        self.assertEqual(first, second)
        self.assertTrue(data.X.equals(original_X))
        self.assertTrue(data.y.equals(original_y))


if __name__ == "__main__":
    unittest.main()
