"""Synthetic aggregates, fake metadata and temporary dummy paths only."""

from copy import deepcopy
from dataclasses import FrozenInstanceError, asdict, replace
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from training.optimization_v2 import _summary, paired_comparison
from training.optimization_v2_comparison import compare_predictor_sets
from training.optimization_v2_validation import verify_optimization_v2
from training import private_v2_contracts as c


def fake_report():
    grid = [asdict(item) for item in c.CATALOG]
    groups = {}
    audits = []
    for subset, _ in c.SETS:
        for family in c.FAMILIES:
            chosen = next(item for item in grid if item['subset'] == subset and item['model']['name'] == family)
            folds = []
            for repeat in range(1, 4):
                for fold in range(1, 6):
                    test = 36 // 5 + (fold <= 36 % 5)
                    folds.append(dict(repeat=repeat, fold=fold, train_size=36-test, test_size=test,
                                      candidate=chosen, failure=None, warning_codes=(),
                                      metrics=dict(mae=.5, rmse=.6, r2=-.1, r2_undefined_reason=None)))
            groups[f'{subset}/{family}'] = dict(folds=folds, summary=_summary(folds))
    baseline = groups['A/dummy']['folds']
    for group in groups.values():
        group['paired_dummy'] = paired_comparison(group['folds'], baseline)
    for repeat in range(1, 4):
        for fold in range(1, 6):
            audits.append(dict(repeat=repeat, fold=fold, scores=[dict(candidate=item,
                failed_folds=0, mae=1., rmse=1., failure_codes=[], warning_codes=[]) for item in grid]))
    selection = deepcopy(groups['C/dummy'])
    return dict(version='ml-optimization-v2', data_origin='synthetic', exploratory_post_v1=True,
        n_samples=36, protocol=dict(outer_splits=5, inner_splits=3, outer_repeats=3, random_state=42),
        runtime={k:c.PINNED[k] for k in ('numpy','pandas','scikit-learn')}, predictor_sets=dict(c.SETS),
        candidates=grid, inner_audit=audits, comparisons=groups, selection=selection,
        subset_frequency=dict(A=0,B=0,C=15), model_frequency=dict(dummy=15,ridge=0,random_forest=0,svr=0),
        candidate_frequency=[dict(candidate=item,count=15 if item==grid[14] else 0) for item in grid],
        failed_selection_folds=0)


def outputs(report):
    return c.AggregateOutputs(report, asdict(verify_optimization_v2(report)), compare_predictor_sets(report))


def manifest():
    return c.ProvenanceManifest(
        git_commit='a'*40, working_tree_dirty=False, protocol_sha256=c.PROTOCOL_SHA256,
        config=c.FrozenEvaluationConfig(), source_sha256=tuple((k,'b'*64) for k in sorted(c.REQUIRED_MODULES)),
        libraries=tuple(c.PINNED.items()), python_version='3.12.14', environment_sha256='c'*64,
        input_sha256='d'*64, ordered_population_commitment='e'*64, partitions_commitment='f'*64,
        comparison_version='ml-optimization-v2-contrasts/1', preflight=c.OperationalPreflight(True),
        human_review=c.HumanReviewRecord(), state=c.ExecutionState.AWAITING_INSTITUTION)


class PrivateContractsTests(unittest.TestCase):
    def test_frozen_configuration_matches_implementation(self):
        c.validate_config(c.FrozenEvaluationConfig())

    def test_configuration_drift_rejected(self):
        for change in (dict(outer_splits=4), dict(inner_splits=True), dict(outer_repeats=2),
                       dict(random_state=43), dict(candidates=c.CATALOG[::-1]),
                       dict(predictor_sets=c.SETS[:2]), dict(candidates=c.CATALOG[:-1])):
            with self.subTest(change=change), self.assertRaises(c.ContractError):
                c.validate_config(replace(c.FrozenEvaluationConfig(), **change))

    def test_document_integrity_and_mutation(self):
        payload=(Path(__file__).resolve().parents[2]/'docs/ML_OPTIMIZATION_V2_PROTOCOL.md').read_bytes()
        self.assertEqual(c.validate_protocol_bytes(payload), c.PROTOCOL_SHA256)
        c.validate_protocol_bytes(payload.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n'))
        with self.assertRaises(c.ContractError): c.validate_protocol_bytes(payload+b'changed')

    def test_flags_never_institutional_evidence(self):
        for review in (True, dict(authorized=True), c.HumanReviewRecord(institutional=True),
                       c.HumanReviewRecord(c.InstitutionalReview.RECORDED_BY_HUMAN)):
            with self.assertRaises(c.ContractError): c.validate_human_review(review)

    def test_separate_review_stages_never_enable_execution(self):
        pre = c.OperationalPreflight(True)
        review = c.HumanReviewRecord()
        self.assertEqual(c.preparation_state(pre,review),c.ExecutionState.AWAITING_INSTITUTION)
        review=replace(review,institutional=c.InstitutionalReview.RECORDED_BY_HUMAN,
                       institutional_evidence_sha256='a'*64)
        self.assertEqual(c.preparation_state(pre,review),c.ExecutionState.AWAITING_POPULATION)
        review=replace(review,population=c.PopulationReview.RECORDED_BY_HUMAN,population_evidence_sha256='b'*64)
        self.assertEqual(c.preparation_state(pre,review),c.ExecutionState.EXPERIMENT_NOT_IMPLEMENTED)
        self.assertFalse(pre.real_execution_enabled)

    def test_invalid_preflight_and_review_order(self):
        for pre in (c.OperationalPreflight(True,('unsafe_paths',)), c.OperationalPreflight(False),
                    c.OperationalPreflight(False,('participant-secret',))):
            with self.assertRaises(c.ContractError): c.validate_preflight(pre)
        self.assertEqual(c.preparation_state(c.OperationalPreflight(False,('unsafe_paths',)),
                                           c.HumanReviewRecord()),c.ExecutionState.PREFLIGHT_FAILED)
        with self.assertRaises(c.ContractError):
            c.validate_human_review(c.HumanReviewRecord(population=c.PopulationReview.RECORDED_BY_HUMAN,
                                                       population_evidence_sha256='b'*64))

    def test_metadata_only_paths_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp); repo=base/'repo'; root=base/'private'
            repo.mkdir(); root.mkdir(); source=root/'fake.csv'; source.write_bytes(b'fiction-only')
            target=root/'new-output'
            result=c.validate_paths(source,target,repository=repo,private_root=root)
            self.assertEqual(result.source,source.resolve())
            self.assertFalse(target.exists())
            target.mkdir()
            with self.assertRaises(c.ContractError): c.validate_paths(source,target,repository=repo,private_root=root)
            self.assertEqual(source.read_bytes(),b'fiction-only')

    def test_unsafe_paths_are_sanitized(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp); repo=base/'repo'; root=base/'private'; repo.mkdir(); root.mkdir()
            source=root/'fake.csv'; source.write_bytes(b'fiction-only')
            (repo/'fake.csv').write_bytes(b'fiction-only')
            for src,out in ((source,source),(source,repo/'out'),(repo/'fake.csv',root/'out'),
                            (root/'missing.csv',root/'out'),(source,root/'missing'/'out')):
                with self.assertRaisesRegex(c.ContractError,'^UNSAFE_PATHS$') as caught:
                    c.validate_paths(src,out,repository=repo,private_root=root)
                self.assertIsNone(caught.exception.__context__)

    def test_symlink_path_rejected(self):
        from unittest.mock import patch
        with patch.object(Path,'is_symlink',return_value=True):
            with self.assertRaises(c.ContractError):
                c.validate_paths(Path('fake'),Path('out'),repository=Path('repo'),private_root=Path('private'))

    def test_manifest_valid_but_not_authorizing(self):
        m=manifest(); c.validate_manifest(m)
        self.assertFalse(m.real_execution_enabled)
        self.assertEqual(m.state,c.ExecutionState.AWAITING_INSTITUTION)

    def test_manifest_missing_or_inconsistent_metadata(self):
        for change in (dict(input_sha256='bad'),dict(source_sha256=()),dict(libraries=()),
                       dict(working_tree_dirty=True),dict(protocol_sha256='0'*64),
                       dict(git_commit='not-a-commit'),dict(state='running'),
                       dict(state=c.ExecutionState.EXPERIMENT_NOT_IMPLEMENTED)):
            with self.subTest(change=change),self.assertRaises(c.ContractError):
                c.validate_manifest(replace(manifest(),**change))
        with self.assertRaises(c.ContractError): c.validate_manifest({'git_commit':'a'*40})

    def test_allowed_outputs_roundtrip_and_input_preserved(self):
        report=fake_report(); before=deepcopy(report)
        self.assertTrue(c.validate_aggregate_outputs(outputs(report)))
        self.assertEqual(report,before)
        report=json.loads(json.dumps(report))
        self.assertTrue(c.validate_aggregate_outputs(outputs(report)))

    def test_unexpected_and_individual_fields_rejected_at_depth(self):
        for area in ('root','fold','metrics','score','paired','candidate'):
            report=fake_report()
            targets=dict(root=report,fold=report['comparisons']['A/ridge']['folds'][0],
                         metrics=report['comparisons']['A/ridge']['folds'][0]['metrics'],
                         score=report['inner_audit'][0]['scores'][0],
                         paired=report['comparisons']['A/ridge']['paired_dummy'],
                         candidate=report['candidates'][0])
            targets[area]['predictions']=['invented-person-value']
            with self.subTest(area=area),self.assertRaisesRegex(c.ContractError,'^INVALID_OUTPUT_SCHEMA$'):
                c.validate_aggregate_outputs(outputs(report))

    def test_individual_payload_in_allowed_text_rejected(self):
        report=fake_report(); report['comparisons']['A/ridge']['folds'][0]['failure']='invented-person-value'
        with self.assertRaises(c.ContractError): c.validate_aggregate_outputs(outputs(report))

    def test_verification_and_comparison_extra_fields_rejected(self):
        for name in ('verification','comparison'):
            bundle=outputs(fake_report()); getattr(bundle,name)['records']=['invented']
            with self.assertRaises(c.ContractError): c.validate_aggregate_outputs(bundle)

    def test_incomplete_diagnostics_are_not_complete(self):
        report=fake_report(); report['comparisons']['B/ridge']['folds'].pop()
        self.assertFalse(c.validate_aggregate_outputs(outputs(report)))

    def test_frozen_output_configuration_required(self):
        report=fake_report(); report['protocol']['random_state']=43
        with self.assertRaises(c.ContractError): c.validate_aggregate_outputs(outputs(report))

    def test_output_hash_binding(self):
        bundle=outputs(fake_report())
        hashes=tuple((name,hashlib.sha256(json.dumps(getattr(bundle,name),sort_keys=True,
                      ensure_ascii=False,allow_nan=False).encode()).hexdigest())
                     for name in ('report','verification','comparison'))
        m=replace(manifest(),output_sha256=hashes)
        result=c.validate_provenance_outputs(m,bundle)
        self.assertTrue(result.hashes_match)
        self.assertTrue(result.output_structure_valid)
        self.assertTrue(result.analytical_complete)
        self.assertFalse(result.execution_certified)
        self.assertFalse(c.validate_provenance_outputs(manifest(),bundle).hashes_match)
        with self.assertRaisesRegex(c.ContractError,'EXPLICIT_BINDING_STATUS_REQUIRED'):
            bool(result)

    def test_mutable_configurations_rejected_before_conversion(self):
        config=c.FrozenEvaluationConfig()
        first=config.candidates[0]
        for change in (
            dict(candidates=tuple(asdict(v) for v in c.CATALOG)),
            dict(candidates=list(c.CATALOG)),
            dict(predictor_sets=tuple((s,list(keys)) for s,keys in c.SETS)),
            dict(predictor_sets=list(c.SETS)),
            dict(candidates=(replace(first,model=asdict(first.model)),)+c.CATALOG[1:]),
            dict(candidates=(replace(first,model=replace(first.model,parameters=[])),)+c.CATALOG[1:]),
            dict(candidates=(c.CATALOG[0],replace(c.CATALOG[1],model=c.Candidate('ridge',(['alpha',1.0],))))+c.CATALOG[2:]),
            dict(candidates=(c.CATALOG[0],replace(c.CATALOG[1],model=c.Candidate('ridge',(('alpha',True),))))+c.CATALOG[2:]),
        ):
            with self.subTest(change=change),patch.object(c,'asdict',side_effect=AssertionError('conversion forbidden')):
                with self.assertRaisesRegex(c.ContractError,'^INVALID_CONFIG$'):
                    c.validate_config(replace(config,**change))

    def test_accepted_configuration_is_deeply_immutable(self):
        config=c.FrozenEvaluationConfig(); c.validate_config(config)
        with self.assertRaises(FrozenInstanceError): config.random_state=43
        with self.assertRaises(TypeError): config.predictor_sets[0][1][0]='changed'
        with self.assertRaises(FrozenInstanceError): config.candidates[0].model.name='svr'
        with self.assertRaises(TypeError): config.candidates[1].model.parameters[0][1]=2.0

    def test_mutable_manifest_maps_and_pairs_rejected(self):
        m=manifest()
        for name in ('source_sha256','libraries','output_sha256'):
            for value in (dict(getattr(m,name)),list(getattr(m,name)),
                          tuple(list(pair) for pair in getattr(m,name)) if getattr(m,name) else ([],)):
                with self.subTest(name=name,value=value),self.assertRaises(c.ContractError):
                    c.validate_manifest(replace(m,**{name:value}))

    def test_manifest_scalar_types_are_exact(self):
        class MutableString(str):
            pass
        m=manifest()
        for name in ('protocol_sha256','python_version','comparison_version'):
            with self.subTest(name=name),self.assertRaises(c.ContractError):
                c.validate_manifest(replace(m,**{name:MutableString(getattr(m,name))}))

    def test_forest_global_default_drift_rejected_without_fit(self):
        from training import regression_models
        with patch.object(regression_models,'DEFAULT_FOREST_TREES',999),patch.object(
                c.RandomForestRegressor,'fit',side_effect=AssertionError('fit forbidden')):
            with self.assertRaises(c.ContractError): c.validate_config(c.FrozenEvaluationConfig())

    def test_each_estimator_effective_parameter_drift_rejected(self):
        from training import optimization_v2
        original=optimization_v2.build_regression_pipeline
        for family,changes in (
            ('dummy',{'regressor__strategy':'median'}),
            ('ridge',{'regressor__fit_intercept':False}),
            ('random_forest',{'regressor__max_features':.5}),
            ('svr',{'regressor__epsilon':.2}),
        ):
            def changed(name,*args,**kwargs):
                model=original(name,*args,**kwargs)
                if name==family: model.set_params(**changes)
                return model
            with self.subTest(family=family),patch.object(optimization_v2,'build_regression_pipeline',side_effect=changed):
                with self.assertRaises(c.ContractError): c.validate_config(c.FrozenEvaluationConfig())

    def test_preprocessing_drift_rejected(self):
        from training import optimization_v2
        original=optimization_v2.build_regression_pipeline
        for changes in (
            {'preprocess__columns__numeric__with_mean':False},
            {'preprocess__columns__categorical__handle_unknown':'ignore'},
            {'preprocess__columns__categorical__categories':'auto'},
            {'preprocess__columns__remainder':'passthrough'},
            {'preprocess__memory':'fiction-cache-never-used'},
        ):
            def changed(*args,**kwargs):
                return original(*args,**kwargs).set_params(**changes)
            with self.subTest(changes=changes),patch.object(optimization_v2,'build_regression_pipeline',side_effect=changed):
                with self.assertRaises(c.ContractError): c.validate_config(c.FrozenEvaluationConfig())

    def test_parameter_drift_in_reduced_subset_is_checked(self):
        original=c.build_candidate
        def changed(candidate,*args,**kwargs):
            model=original(candidate,*args,**kwargs)
            if candidate.subset=='C' and candidate.model.name=='svr':
                model.set_params(model__regressor__gamma='auto')
            return model
        with patch.object(c,'build_candidate',side_effect=changed):
            with self.assertRaises(c.ContractError): c.validate_config(c.FrozenEvaluationConfig())

    def test_malformed_config_graphs_are_sanitized_before_asdict(self):
        cycle={}; cycle['self']=cycle
        loop=[]; loop.append(loop)
        deep='fiction-only'
        for _ in range(2000): deep=(deep,)
        for value in (cycle,loop,deep,object(),float('nan'),float('inf')):
            config=replace(c.FrozenEvaluationConfig(),candidates=(value,))
            with patch.object(c,'asdict',side_effect=AssertionError('conversion forbidden')):
                with self.assertRaisesRegex(c.ContractError,'^INVALID_CONFIG$') as caught:
                    c.validate_config(config)
                self.assertIsNone(caught.exception.__context__)

    def test_cyclic_deep_or_incompatible_output_graphs_are_sanitized(self):
        cycle={}; cycle['self']=cycle
        loop=[]; loop.append(loop)
        deep='fiction-only'
        for _ in range(2000): deep=[deep]
        for value in (cycle,loop,deep,object(),float('nan'),float('inf')):
            bundle=outputs(fake_report()); bundle.report['unexpected']=value
            for validate in (lambda:c.validate_aggregate_outputs(bundle),
                             lambda:c.validate_provenance_outputs(manifest(),bundle)):
                with self.assertRaisesRegex(c.ContractError,'^INVALID_OUTPUT_SCHEMA$') as caught:
                    validate()
                self.assertIsNone(caught.exception.__context__)

    def test_cyclic_manifest_mappings_rejected(self):
        cycle={}; cycle['self']=cycle
        loop=[]; loop.append(loop)
        for value in (cycle,loop,((cycle,loop),)):
            with self.assertRaisesRegex(c.ContractError,'^INVALID_MANIFEST$'):
                c.validate_manifest(replace(manifest(),source_sha256=value))

    def test_binding_crosses_origin_preflight_and_human_metadata_without_authorizing(self):
        initial=c.HumanReviewRecord()
        institution=replace(initial,institutional=c.InstitutionalReview.RECORDED_BY_HUMAN,
                            institutional_evidence_sha256='a'*64)
        reviewed=replace(institution,population=c.PopulationReview.RECORDED_BY_HUMAN,
                         population_evidence_sha256='b'*64)
        for origin in ('synthetic','real_authorized'):
            for passed in (False,True):
                for review in (initial,institution,reviewed):
                    report=fake_report(); report['data_origin']=origin
                    bundle=outputs(report)
                    pre=c.OperationalPreflight(passed,() if passed else ('unsafe_paths',))
                    m=replace(manifest(),preflight=pre,human_review=review,state=c.preparation_state(pre,review))
                    hashes=tuple((k,hashlib.sha256(c._json(getattr(bundle,k)).encode()).hexdigest())
                                 for k in ('report','verification','comparison'))
                    result=c.validate_provenance_outputs(replace(m,output_sha256=hashes),bundle)
                    self.assertTrue(result.hashes_match)
                    self.assertTrue(result.output_structure_valid)
                    self.assertTrue(result.analytical_complete)
                    self.assertFalse(result.execution_certified)
                    self.assertFalse(result.real_execution_enabled)
                    self.assertEqual(result.human_authorization,c.HumanAuthorizationStatus.NOT_ESTABLISHED_BY_METADATA)
                    expected=(c.BindingCompatibility.PREFLIGHT_FAILED if not passed else
                              c.BindingCompatibility.REAL_EXECUTOR_UNAVAILABLE if origin=='real_authorized' else
                              c.BindingCompatibility.SYNTHETIC_DOCUMENTS_ONLY)
                    self.assertEqual(result.preparation_compatibility,expected)

    def test_binding_structure_incompleteness_and_hashes_are_distinct(self):
        report=fake_report(); report['comparisons']['B/ridge']['folds'].pop()
        result=c.validate_provenance_outputs(manifest(),outputs(report))
        self.assertTrue(result.output_structure_valid)
        self.assertFalse(result.analytical_complete)
        self.assertFalse(result.hashes_match)
        bundle=outputs(fake_report()); bundle.verification['records']=['fiction-only']
        result=c.validate_provenance_outputs(manifest(),bundle)
        self.assertFalse(result.output_structure_valid)
        self.assertIsNone(result.analytical_complete)
        self.assertEqual(result.preparation_compatibility,c.BindingCompatibility.INVALID_OUTPUT_STRUCTURE)


if __name__=='__main__':
    unittest.main()
