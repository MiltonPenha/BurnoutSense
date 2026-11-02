"""Private executor tests: generated CSV, fictitious evidence and signatures only."""

from copy import deepcopy
import csv
from dataclasses import asdict, replace
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from test_private_v2_contracts import fake_report
from training.run_optimization_v2 import synthetic_csv_bytes
from training import run_private_optimization_v2 as runner


class PrivateExecutorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get('BURNOUTSENSE_TEST_TMPDIR'))
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.data, self.trust = self.root/'private', self.root/'trust'
        self.data.mkdir(); self.trust.mkdir()
        self.plan = runner.PrivatePlan(self.data/'fiction.csv', self.data/'output', self.data, self.trust,
            self.trust/'institution.txt', self.trust/'tcle.txt', self.trust/'document-review.json',
            self.trust/'population-review.json', self.trust/'key.bin')
        self.key = b'K' * 32  # Fictitious test key; never a production secret.
        assert len(self.key)==32
        self.plan.source.write_bytes(synthetic_csv_bytes(36))
        self.plan.institution_document.write_bytes(b'FICTITIOUS INSTITUTION REVIEW')
        self.plan.tcle_document.write_bytes(b'FICTITIOUS TCLE fiction-person@example.invalid')
        self.plan.verification_key.write_bytes(self.key)
        self.runtime = runner.describe_runtime()
        self.perms = patch.object(runner,'_private_permissions')
        self.perms.start(); self.addCleanup(self.perms.stop)
        self.document = self.document_record()
        self.sign(self.plan.documentary_review,self.document)

    def dates(self):
        now=datetime.now(timezone.utc)
        return dict(issued_utc=(now-timedelta(minutes=1)).strftime('%Y-%m-%dT%H:%M:%SZ'),
                    expires_utc=(now+timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ'))

    def document_record(self):
        return dict(version='private-v2-document-review/1', decision='institution_and_tcle_reviewed',
            scope='academic_evaluation_no_publication', data_origin='synthetic',
            input_sha256=hashlib.sha256(self.plan.source.read_bytes()).hexdigest(),
            institution_sha256=hashlib.sha256(self.plan.institution_document.read_bytes()).hexdigest(),
            tcle_sha256=hashlib.sha256(self.plan.tcle_document.read_bytes()).hexdigest(),
            protocol_sha256=self.runtime['protocol_sha256'], code_sha256=self.runtime['code_sha256'],
            environment_sha256=self.runtime['environment_sha256'],
            destination_sha256=runner.destination_sha256(self.plan.output), **self.dates())

    def sign(self,path,record):
        signature=hmac.new(self.key,runner._canonical(record),'sha256').hexdigest()
        path.write_bytes(runner._canonical(dict(record=record,signature=signature)))

    def population(self):
        inspection=runner.inspect_private_input(self.plan)
        record=dict(version='private-v2-population-review/1',decision='population_reviewed_for_this_evaluation',
            data_origin='synthetic', independence='independent_observations_reviewed',
            exclusions='eligibility_and_exclusions_reviewed',v1_pairing='not_established',
            **asdict(inspection),**self.dates())
        self.sign(self.plan.population_review,record)
        return record

    def assert_rejected(self,call,code=None):
        with self.assertRaises(runner.PrivateExecutionError) as caught:
            call()
        if code: self.assertEqual(str(caught.exception),code)
        self.assertIsNone(caught.exception.__context__)
        self.assertNotIn('fiction-person',str(caught.exception))

    def test_valid_inspection_without_training_or_output(self):
        with patch.object(runner,'run_optimization_v2') as fit:
            first=runner.inspect_private_input(self.plan)
            self.assertEqual(first,runner.inspect_private_input(self.plan))
            self.assertEqual(first.counts,dict(rows_read=36,eligible=36,ineligible=0,rejected=0))
            fit.assert_not_called()
        self.assertFalse(self.plan.output.exists())
        self.assertEqual(first.input_sha256,hashlib.sha256(self.plan.source.read_bytes()).hexdigest())

    def test_missing_or_extra_columns_rejected(self):
        payload=self.plan.source.read_bytes()
        for mode in ('missing','extra'):
            rows=list(csv.reader(io.StringIO(payload.decode('utf-8-sig'))))
            rows=[row[:-1] if mode=='missing' else row+['fiction-extra'] for row in rows]
            stream=io.StringIO(); csv.writer(stream).writerows(rows)
            self.plan.source.write_bytes(stream.getvalue().encode('utf-8-sig'))
            self.sign(self.plan.documentary_review,self.document_record())
            self.assert_rejected(lambda:runner.inspect_private_input(self.plan))
        self.assertFalse(self.plan.output.exists())

    def test_invalid_file_and_insufficient_data(self):
        valid=synthetic_csv_bytes(36)
        for payload in (b'\xffinvalid', b'fiction-only', b'\n'.join(valid.splitlines()[:10])+b'\n'):
            self.plan.source.write_bytes(payload)
            self.sign(self.plan.documentary_review,self.document_record())
            self.assert_rejected(lambda:runner.inspect_private_input(self.plan))

    def test_permission_failure_before_any_data_read(self):
        with patch.object(runner,'_private_permissions',side_effect=runner.PrivateExecutionError('PRIVATE_PERMISSIONS_REQUIRED')), \
                patch.object(runner,'_read') as read:
            self.assert_rejected(lambda:runner.inspect_private_input(self.plan),'PRIVATE_PERMISSIONS_REQUIRED')
            read.assert_not_called()

    def test_arbitrary_private_error_text_is_not_exposed(self):
        with patch.object(runner,'_prepare',side_effect=runner.PrivateExecutionError('fiction-person@example.invalid')):
            self.assert_rejected(lambda:runner.inspect_private_input(self.plan),'PRIVATE_INSPECTION_FAILED')

    def test_real_origin_dirty_code_blocks_before_csv_read(self):
        record=deepcopy(self.document); record['data_origin']='real_authorized'
        self.sign(self.plan.documentary_review,record)
        runtime={**self.runtime,'working_tree_dirty':True}
        original=runner._read; seen=[]
        def tracked(path,limit):
            seen.append(path); return original(path,limit)
        with patch.object(runner,'describe_runtime',return_value=runtime),patch.object(runner,'_read',side_effect=tracked):
            self.assert_rejected(lambda:runner.inspect_private_input(self.plan),'CLEAN_CODE_REQUIRED')
        self.assertNotIn(self.plan.source,seen)

    def test_unsafe_repository_path(self):
        self.assert_rejected(lambda:runner.inspect_private_input(replace(self.plan,output=runner.REPOSITORY/'never-create')))

    def test_wrong_signature_does_not_open_csv(self):
        value=json.loads(self.plan.documentary_review.read_text())
        value['signature']='0'*64
        self.plan.documentary_review.write_text(json.dumps(value))
        original=runner._read; seen=[]
        def tracked(path,limit):
            seen.append(path); return original(path,limit)
        with patch.object(runner,'_read',side_effect=tracked):
            self.assert_rejected(lambda:runner.inspect_private_input(self.plan),'REVIEW_AUTHENTICATION_FAILED')
        self.assertNotIn(self.plan.source,seen)

    def test_authorized_flag_is_not_documentary_review(self):
        self.plan.documentary_review.write_text('{"authorized":true}')
        self.assert_rejected(lambda:runner.inspect_private_input(self.plan),'INVALID_REVIEW')

    def test_document_or_tcle_changed(self):
        self.plan.tcle_document.write_bytes(b'changed-fiction-only')
        self.assert_rejected(lambda:runner.inspect_private_input(self.plan),'DOCUMENT_CHANGED')

    def test_expired_review(self):
        self.document.update(issued_utc='2020-01-01T00:00:00Z',expires_utc='2020-01-01T01:00:00Z')
        self.sign(self.plan.documentary_review,self.document)
        self.assert_rejected(lambda:runner.inspect_private_input(self.plan),'REVIEW_EXPIRED')

    def test_code_environment_and_input_provenance_mismatch(self):
        for field in ('code_sha256','environment_sha256','input_sha256','destination_sha256'):
            record=deepcopy(self.document); record[field]='0'*64
            self.sign(self.plan.documentary_review,record)
            self.assert_rejected(lambda:runner.inspect_private_input(self.plan))

    def test_population_independence_not_reviewed_blocks_fit(self):
        record=self.population(); record['independence']='not_reviewed'
        self.sign(self.plan.population_review,record)
        with patch.object(runner,'run_optimization_v2') as fit:
            self.assert_rejected(lambda:runner.run_private_evaluation(self.plan),'POPULATION_REVIEW_REQUIRED')
            fit.assert_not_called()
        self.assertFalse(self.plan.output.exists())

    def test_population_counts_or_partitions_changed_blocks_fit(self):
        original=self.population()
        for field in ('counts','partitions_commitment'):
            record=deepcopy(original)
            record[field]=dict(rows_read=39,eligible=36,ineligible=3,rejected=0) if field=='counts' else '0'*64
            self.sign(self.plan.population_review,record)
            self.assert_rejected(lambda:runner.run_private_evaluation(self.plan),'POPULATION_REVIEW_MISMATCH')

    def test_existing_destination_not_overwritten(self):
        self.plan.output.mkdir(); sentinel=self.plan.output/'sentinel.txt'; sentinel.write_text('fiction-keep')
        self.assert_rejected(lambda:runner.run_private_evaluation(self.plan))
        self.assertEqual(sentinel.read_text(),'fiction-keep')

    def test_aggregate_outputs_no_individual_data(self):
        self.population(); output=io.StringIO()
        with patch.object(runner,'run_optimization_v2',return_value=fake_report()) as fit, \
                patch('sys.stdout',output),patch('sys.stderr',output):
            result=runner.run_private_evaluation(self.plan)
        self.assertTrue(result.technically_complete)
        self.assertEqual(output.getvalue(),'')
        self.assertEqual(asdict(fit.call_args.kwargs['protocol']),dict(outer_splits=5,inner_splits=3,outer_repeats=3,random_state=42))
        self.assertEqual({p.name for p in self.plan.output.iterdir()},
                         {'started.json','prepared.json','finished.json','report.aggregate.json','verification.aggregate.json','comparison.aggregate.json','manifest.json'})
        for path in self.plan.output.iterdir():
            text=path.read_text(encoding='utf-8')
            for forbidden in ('fiction-person','SYNTHETIC_ONLY','predictions','train_indices','test_indices',str(self.root)):
                self.assertNotIn(forbidden,text)
        manifest=json.loads((self.plan.output/'manifest.json').read_text())
        for name,hash_value in manifest['output_sha256'].items():
            self.assertEqual(hash_value,hashlib.sha256((self.plan.output/(name+'.aggregate.json')).read_bytes()).hexdigest())
        self.assertTrue(runner.validate_completed_run(self.plan.output,result).valid_artifacts)

    def test_fatal_fit_failure_is_sanitized_and_preserved(self):
        self.population()
        with patch.object(runner,'run_optimization_v2',side_effect=RuntimeError('fiction-person@example.invalid')):
            self.assert_rejected(lambda:runner.run_private_evaluation(self.plan),'EVALUATION_OR_OUTPUT_FAILED')
        self.assertTrue((self.plan.output/'failed.json').exists())
        self.assertNotIn('fiction-person',(self.plan.output/'failed.json').read_text())

    def test_incomplete_results_preserve_diagnostics(self):
        self.population(); report=fake_report()
        report['comparisons']['B/ridge']['folds'][0].update(failure='fit_failed',metrics=None)
        with patch.object(runner,'run_optimization_v2',return_value=report):
            result=runner.run_private_evaluation(self.plan)
        self.assertFalse(result.technically_complete)
        self.assertEqual(result.status,'incomplete')
        conclusion=runner.validate_completed_run(self.plan.output,result)
        self.assertTrue(conclusion.valid_artifacts)
        self.assertFalse(conclusion.technically_complete)
        saved=json.loads((self.plan.output/'report.aggregate.json').read_text())
        self.assertEqual(saved['comparisons']['B/ridge']['folds'][0]['failure'],'fit_failed')

    def test_unexpected_individual_output_field_never_saved(self):
        self.population(); report=fake_report(); report['records']=['fiction-person@example.invalid']
        with patch.object(runner,'run_optimization_v2',return_value=report):
            self.assert_rejected(lambda:runner.run_private_evaluation(self.plan))
        self.assertFalse((self.plan.output/'report.aggregate.json').exists())

    def test_python_network_block_and_restoration(self):
        import socket
        original=socket.socket
        with runner._offline_scope():
            self.assert_rejected(lambda:socket.socket(),'NETWORK_DISABLED')
        self.assertIs(socket.socket,original)

    def test_git_configuration_cannot_hide_pending_files(self):
        override={'GIT_CONFIG_COUNT':'1','GIT_CONFIG_KEY_0':'status.showUntrackedFiles',
                  'GIT_CONFIG_VALUE_0':'no','GIT_CONFIG_PARAMETERS':"'status.showUntrackedFiles=no'"}
        before=runner.describe_runtime()
        with patch.dict(os.environ,override): after=runner.describe_runtime()
        self.assertEqual(before,after)

    def test_git_redirection_environment_is_ignored(self):
        before=runner.describe_runtime()
        override={'GIT_DIR':str(self.root/'fiction-git'), 'GIT_WORK_TREE':str(self.root),
                  'GIT_INDEX_FILE':str(self.root/'fiction-index'), 'GIT_COMMON_DIR':str(self.root/'fiction-common'),
                  'GIT_CONFIG_GLOBAL':str(self.root/'fiction-config')}
        with patch.dict(os.environ,override): after=runner.describe_runtime()
        self.assertEqual(before,after)
        self.assertFalse((self.root/'fiction-index').exists())

    def test_git_command_has_explicit_environment_and_visibility(self):
        original=subprocess.check_output; observed=[]
        def tracked(command,**kwargs):
            observed.append((command,kwargs.get('env')))
            return original(command,**kwargs)
        with patch.object(runner.subprocess,'check_output',side_effect=tracked): runner.describe_runtime()
        status=[command for command,env in observed if 'status' in command]
        self.assertTrue(status)
        self.assertTrue(all('--untracked-files=all' in command for command in status))
        for command,env in observed:
            self.assertNotIn('GIT_DIR',env); self.assertEqual(env['GIT_CONFIG_GLOBAL'],os.devnull)
            self.assertIn('--no-optional-locks',command)

    def test_untracked_required_module_is_not_head_aligned(self):
        name='ai-service/training/run_private_optimization_v2.py'
        original=runner._git
        def missing(arguments,payload=None):
            result=original(arguments,payload)
            if arguments[0] in ('ls-tree','ls-files'):
                result=b'\0'.join(p for p in result.split(b'\0') if p and not p.endswith(name.encode()))+b'\0'
            return result
        with patch.object(runner,'_git',side_effect=missing): value=runner._git_integrity()
        self.assertFalse(value['required_files_match_head'])
        self.assertIn(name,value['required_files_not_matching_head'])

    def test_changed_required_file_is_detected_without_modifying_disk(self):
        name='ai-service/training/esbeu_scoring.py'
        original=Path.read_bytes
        def changed(path):
            data=original(path)
            return data+b'\n# FICTIONAL CHANGE\n' if path==runner.REPOSITORY/name else data
        with patch.object(runner,'SOURCE_FILES',(name,)):
            self.assertTrue(runner._git_integrity()['required_files_match_head'])
            with patch.object(Path,'read_bytes',changed):
                self.assertFalse(runner._git_integrity()['required_files_match_head'])

    def test_wrong_repository_and_git_failure_are_sanitized(self):
        original=runner._git
        def wrong(arguments,payload=None):
            if arguments==['rev-parse','--show-toplevel']: return str(self.root).encode()+b'\n'
            return original(arguments,payload)
        with patch.object(runner,'_git',side_effect=wrong):
            self.assert_rejected(runner.describe_runtime,'OPERATIONAL_PREFLIGHT_FAILED')
        with patch.object(runner,'_git',side_effect=RuntimeError('fiction-person@example.invalid')):
            self.assert_rejected(runner.describe_runtime,'OPERATIONAL_PREFLIGHT_FAILED')

    def test_real_origin_requires_head_alignment_even_if_status_appears_clean(self):
        record=deepcopy(self.document); record['data_origin']='real_authorized'
        self.sign(self.plan.documentary_review,record)
        runtime={**self.runtime,'working_tree_dirty':False,'required_files_match_head':False}
        with patch.object(runner,'describe_runtime',return_value=runtime),patch.object(runner,'_read',wraps=runner._read) as read:
            self.assert_rejected(lambda:runner.inspect_private_input(self.plan),'CLEAN_CODE_REQUIRED')
        self.assertFalse(any(call.args[0]==self.plan.source for call in read.call_args_list))

    def test_unicode_destination_collision_eliminated(self):
        self.plan=replace(self.plan,output=self.data/'stra\u00dfe')
        self.document=self.document_record(); self.sign(self.plan.documentary_review,self.document)
        self.population()
        other=self.data/'strasse'
        self.assertNotEqual(runner.destination_sha256(self.plan.output),runner.destination_sha256(other))
        with patch.object(runner,'run_optimization_v2') as fit:
            self.assert_rejected(lambda:runner.run_private_evaluation(replace(self.plan,output=other)),'PROVENANCE_MISMATCH')
            fit.assert_not_called()

    def test_case_differences_conservatively_require_new_review(self):
        self.assertNotEqual(runner.destination_sha256(self.data/'Output'),runner.destination_sha256(self.data/'output'))

    def test_equivalent_resolved_paths_and_distinct_destinations(self):
        self.assertEqual(runner.destination_sha256(self.plan.output),
                         runner.destination_sha256(self.data/'fiction-absent'/'..'/'output'))
        self.assertNotEqual(runner.destination_sha256(self.plan.output),runner.destination_sha256(self.data/'other'))

    def test_ambiguous_windows_names_and_link_aliases_rejected(self):
        if os.name=='nt':
            for leaf in ('output.','output ','output:stream','CON','NUL.txt'):
                self.assert_rejected(lambda:runner.destination_sha256(self.data/leaf),'UNSAFE_PATHS')
        with patch.object(Path,'is_symlink',return_value=True):
            self.assert_rejected(lambda:runner.destination_sha256(self.plan.output),'UNSAFE_PATHS')

    def test_reservation_failure_does_not_touch_an_existing_destination(self):
        self.population()
        def concurrent_reservation(path):
            path.mkdir(); (path/'fiction-sentinel').write_text('keep')
            raise FileExistsError('fiction-race')
        with patch.object(runner,'_reserve_output',side_effect=concurrent_reservation),patch.object(runner,'run_optimization_v2') as fit:
            self.assert_rejected(lambda:runner.run_private_evaluation(self.plan))
            fit.assert_not_called()
        self.assertEqual({p.name for p in self.plan.output.iterdir()},{'fiction-sentinel'})
        self.assertFalse(runner.validate_completed_run(self.plan.output).valid_artifacts)

    def test_failure_at_each_write_stage_is_not_a_valid_completion(self):
        original=self.plan
        for stage in ('started.json','report.aggregate.json','verification.aggregate.json','comparison.aggregate.json',
                      'manifest.json','prepared.json','finished.json'):
            with self.subTest(stage=stage):
                self.plan=replace(original,output=self.data/('out-'+stage))
                self.document=self.document_record(); self.sign(self.plan.documentary_review,self.document)
                self.population(); write=runner._write
                def failed(path,value):
                    if path.name==stage: raise OSError('fiction-person@example.invalid')
                    write(path,value)
                with patch.object(runner,'_write',side_effect=failed),patch.object(runner,'run_optimization_v2',return_value=fake_report()):
                    self.assert_rejected(lambda:runner.run_private_evaluation(self.plan),'EVALUATION_OR_OUTPUT_FAILED')
                self.assertTrue((self.plan.output/'failed.json').exists())
                conclusion=runner.validate_completed_run(self.plan.output)
                self.assertFalse(conclusion.valid_artifacts)
                self.assertEqual(conclusion.issues,('failure_marker_present',))

    def test_failure_after_finished_overrides_apparent_success(self):
        self.population(); write=runner._write
        def failed(path,value):
            write(path,value)
            if path.name=='finished.json': raise OSError('fiction-late-write')
        with patch.object(runner,'_write',side_effect=failed),patch.object(runner,'run_optimization_v2',return_value=fake_report()):
            self.assert_rejected(lambda:runner.run_private_evaluation(self.plan),'EVALUATION_OR_OUTPUT_FAILED')
        self.assertTrue((self.plan.output/'finished.json').exists())
        self.assertFalse(runner.validate_completed_run(self.plan.output).valid_artifacts)

    def test_failure_marker_write_failure_preserves_evidence(self):
        self.population(); write=runner._write
        def failed(path,value):
            if path.name in ('manifest.json','failed.json'): raise OSError('fiction-storage-failure')
            write(path,value)
        with patch.object(runner,'_write',side_effect=failed),patch.object(runner,'run_optimization_v2',return_value=fake_report()):
            self.assert_rejected(lambda:runner.run_private_evaluation(self.plan),'EVALUATION_OR_OUTPUT_FAILED')
        self.assertTrue((self.plan.output/'report.aggregate.json').exists())
        self.assertFalse(runner.validate_completed_run(self.plan.output).valid_artifacts)

    def test_consumer_detects_tampering_and_return_mismatch(self):
        self.population()
        with patch.object(runner,'run_optimization_v2',return_value=fake_report()): result=runner.run_private_evaluation(self.plan)
        self.assertTrue(runner.validate_completed_run(self.plan.output,result).valid_artifacts)
        self.assertFalse(runner.validate_completed_run(self.plan.output,runner.PrivateRunResult('incomplete',False)).valid_artifacts)
        path=self.plan.output/'manifest.json'
        path.write_bytes(path.read_bytes()+b' ')
        self.assertFalse(runner.validate_completed_run(self.plan.output).valid_artifacts)

    def test_full_synthetic_execution_with_native_permission_checks(self):
        self.perms.stop()
        if os.name=='nt':
            script=r'''
$ErrorActionPreference='Stop'
try {
$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
foreach($p in ($env:BURNOUTSENSE_TEST_ACL | ConvertFrom-Json)) {
 $acl=Get-Acl -LiteralPath $p
 $acl.SetAccessRuleProtection($true,$false)
 foreach($old in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($old) }
 foreach($sid in @($me.Value,'S-1-5-18','S-1-5-32-544')) {
  $id=[System.Security.Principal.SecurityIdentifier]::new($sid)
  $rule=[System.Security.AccessControl.FileSystemAccessRule]::new($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
 }
 Set-Acl -LiteralPath $p -AclObject $acl
}
} catch { [Console]::Error.WriteLine($_.FullyQualifiedErrorId); exit 3 }
'''
            env=os.environ.copy(); env['BURNOUTSENSE_TEST_ACL']=json.dumps([str(self.data),str(self.trust)])
            executable=Path(os.environ['SystemRoot'])/'System32/WindowsPowerShell/v1.0/powershell.exe'
            env['PSModulePath']=str(executable.parent/'Modules')
            result=subprocess.run([str(executable),'-NoProfile','-NonInteractive','-Command',script],
                                  env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
        else:
            for path in (self.data,self.trust): path.chmod(0o700)
            for path in (*self.data.iterdir(),*self.trust.iterdir()): path.chmod(0o600)
        self.population()
        if os.name!='nt': self.plan.population_review.chmod(0o600)
        result=runner.run_private_evaluation(self.plan)
        self.assertTrue(result.technically_complete)
        report=json.loads((self.plan.output/'report.aggregate.json').read_text())
        self.assertEqual(report['n_samples'],36)
        self.assertEqual(len(report['candidates']),21)
        self.assertEqual(len(report['selection']['folds']),15)
        self.assertEqual(sum(report['subset_frequency'].values()),15)


if __name__=='__main__':
    unittest.main()
