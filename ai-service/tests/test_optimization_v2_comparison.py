"""Invented fold aggregates and synthetic integration only; no research files."""

from copy import deepcopy
import json
from math import sqrt
import unittest

from test_optimization_v2 import GRID, PROTOCOL, synthetic_data
from training.optimization_v2 import run_optimization_v2, FAMILIES
from training.optimization_v2_comparison import compare_predictor_sets


class ComparisonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = run_optimization_v2(synthetic_data(), protocol=PROTOCOL, candidates=GRID)

    def invented(self):
        report = deepcopy(self.report)
        for family in FAMILIES:
            for subset, values in (("A", [1., 1.]), ("B", [.5, 1.5]), ("C", [.5, .5])):
                for fold, value in zip(report['comparisons'][f'{subset}/{family}']['folds'], values):
                    fold['metrics'].update(mae=value, rmse=value)
        return report

    def test_valid_report_integration_and_reproducibility_no_mutation(self):
        before = deepcopy(self.report)
        first = compare_predictor_sets(self.report)
        self.assertTrue(first['complete'])
        self.assertEqual(first, compare_predictor_sets(self.report))
        self.assertEqual(before, self.report)
        self.assertEqual(len(first['contrasts']), 4)
        for family in first['contrasts'].values():
            self.assertEqual(set(family), {'B-A', 'C-A', 'C-B'})
            for result in family.values():
                self.assertEqual((result['valid_pairs'], result['missing_pairs']), (2, 0))
        for result in first['contrasts']['dummy'].values():
            self.assertEqual(result['mae']['ties'], 2)

    def test_sign_mean_sample_std_and_counts(self):
        result = compare_predictor_sets(self.invented())['contrasts']['ridge']
        ba = result['B-A']
        self.assertEqual([f['mae'] for f in ba['folds']], [-.5, .5])
        for metric in ('mae', 'rmse'):
            self.assertEqual(ba[metric]['difference']['mean'], 0)
            self.assertAlmostEqual(ba[metric]['difference']['std'], sqrt(.5))
            self.assertEqual([ba[metric][k] for k in ('wins', 'ties', 'losses')], [1, 0, 1])
        self.assertEqual(result['C-A']['mae']['wins'], 2)
        self.assertEqual(result['C-B']['mae']['ties'], 1)
        self.assertEqual(result['C-B']['mae']['wins'], 1)
        self.assertEqual(ba['by_repeat'][0]['mae'], ba['mae'])

    def test_order_independent_pairing_by_identity(self):
        report = self.invented()
        expected = compare_predictor_sets(report)['contrasts']
        report['comparisons']['B/ridge']['folds'].reverse()
        self.assertEqual(expected, compare_predictor_sets(report)['contrasts'])

    def test_missing_fold_and_single_pair_std(self):
        report = deepcopy(self.report)
        report['comparisons']['B/ridge']['folds'].pop()
        result = compare_predictor_sets(report)
        self.assertFalse(result['complete'])
        ba = result['contrasts']['ridge']['B-A']
        self.assertEqual((ba['expected_pairs'], ba['valid_pairs'], ba['missing_pairs']), (2, 1, 1))
        self.assertIsNone(ba['mae']['difference']['std'])
        self.assertEqual(ba['folds'][1]['diagnostics']['left'], 'missing_fold')

    def test_absent_group_keeps_all_pairs(self):
        report = deepcopy(self.report)
        del report['comparisons']['C/svr']
        result = compare_predictor_sets(report)['contrasts']['svr']['C-A']
        self.assertEqual(result['missing_pairs'], 2)
        self.assertIsNone(result['mae']['difference']['mean'])

    def test_failed_fold_not_used_even_with_metrics(self):
        report = deepcopy(self.report)
        report['comparisons']['B/ridge']['folds'][0]['failure'] = 'fit_failed'
        result = compare_predictor_sets(report)
        self.assertFalse(result['complete'])
        pair = result['contrasts']['ridge']['B-A']['folds'][0]
        self.assertEqual(pair['diagnostics']['left'], 'failed_fold')
        self.assertIsNone(pair['mae'])

    def test_invalid_metrics_explicit(self):
        for value in (float('nan'), float('inf'), -1, True, None):
            with self.subTest(value=value):
                report = deepcopy(self.report)
                report['comparisons']['B/ridge']['folds'][0]['metrics']['mae'] = value
                result = compare_predictor_sets(report)
                self.assertFalse(result['complete'])
                self.assertEqual(result['contrasts']['ridge']['B-A']['folds'][0]['diagnostics']['left'], 'invalid_metrics')
                json.dumps(result, allow_nan=False)

    def assert_invalid_metrics_pair(self, report):
        before = deepcopy(report)
        result = compare_predictor_sets(report)
        self.assertFalse(result['complete'])
        contrast = result['contrasts']['ridge']['B-A']
        self.assertEqual((contrast['valid_pairs'], contrast['missing_pairs']), (1, 1))
        pair = contrast['folds'][0]
        self.assertEqual(pair['status'], 'unavailable')
        self.assertEqual(pair['diagnostics'], {'left': 'invalid_metrics', 'right': 'valid'})
        self.assertIsNone(pair['mae'])
        self.assertIsNone(pair['rmse'])
        self.assertEqual(report, before)

    def test_missing_metrics_field_is_invalid_metrics(self):
        report = deepcopy(self.report)
        del report['comparisons']['B/ridge']['folds'][0]['metrics']
        self.assert_invalid_metrics_pair(report)

    def test_empty_metrics_is_invalid_metrics(self):
        report = deepcopy(self.report)
        report['comparisons']['B/ridge']['folds'][0]['metrics'] = {}
        self.assert_invalid_metrics_pair(report)

    def test_successful_fold_missing_partition_sizes_rejected_safely(self):
        for fields in (('train_size',), ('test_size',), ('train_size', 'test_size')):
            with self.subTest(fields=fields):
                report = deepcopy(self.report)
                fold = report['comparisons']['B/ridge']['folds'][0]
                for field in fields:
                    del fold[field]
                with self.assertRaisesRegex(ValueError, '^Relatório v2 incompatível para comparação pareada\\.$') as caught:
                    compare_predictor_sets(report)
                self.assertIsNone(caught.exception.__context__)

    def test_incompatible_partitions_duplicates_and_candidates_rejected(self):
        def size(f): f.update(test_size=999)
        def identity(f): f.update(repeat=99)
        def boolean(f): f.update(fold=True)
        def candidate(f): f['candidate'].update(subset='C')
        for change in (size, identity, boolean, candidate):
            report = deepcopy(self.report)
            change(report['comparisons']['B/ridge']['folds'][0])
            with self.assertRaisesRegex(ValueError, '^Relatório v2 incompatível'):
                compare_predictor_sets(report)
        report = deepcopy(self.report)
        report['comparisons']['B/ridge']['folds'].append(deepcopy(report['comparisons']['B/ridge']['folds'][0]))
        with self.assertRaises(ValueError): compare_predictor_sets(report)

    def test_exact_ties_no_tolerance(self):
        report = self.invented()
        fold = report['comparisons']['B/ridge']['folds'][0]
        fold['metrics'].update(mae=1 - 1e-12, rmse=1.)
        result = compare_predictor_sets(report)['contrasts']['ridge']['B-A']
        self.assertEqual(result['mae']['wins'], 1)

    def test_privacy_no_arbitrary_input_payload_forwarded(self):
        report = deepcopy(self.report)
        report['private_sentinel'] = 'invented-only-sentinel'
        report['comparisons']['B/ridge']['folds'][0]['failure'] = 'invented-only-sentinel'
        text = json.dumps(compare_predictor_sets(report), allow_nan=False)
        for forbidden in ('invented-only-sentinel', 'predictions', 'records', 'train_indices', 'test_indices'):
            self.assertNotIn(forbidden, text)


if __name__ == '__main__':
    unittest.main()
