import importlib.util
import json
import io
from pathlib import Path
import tempfile
import tarfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('recovery', Path(__file__).parents[1] / 'disaster-recovery.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.calls = []
        self.failure = None
        self.cfg = {key: str(self.root / key) for key in ['repository', 'backup_directory', 'secrets_directory', 'mongo_config', 'recipients_file', 'rclone_config']}
        self.cfg['remote'] = 'external:backups'
        for key in ['mongo_config', 'recipients_file', 'rclone_config']:
            Path(self.cfg[key]).write_text('test-only')
        self.uploads = self.root / 'uploads'
        self.uploads.mkdir()
        (self.uploads / 'document').write_text('test document')
        Path(self.cfg['secrets_directory']).mkdir()
        (Path(self.cfg['secrets_directory']) / 'app.env').write_text('test-only secret')
        self.remote = self.root / 'external-copy.age'

    def tearDown(self):
        self.temporary.cleanup()

    def fake_run(self, args, timeout=300):
        self.calls.append(args)
        tool = args[0]
        if self.failure and self.failure in args:
            raise RuntimeError('Simulated failure')
        if tool == 'git':
            if 'rev-parse' in args:
                return 'a' * 40
            if 'bundle' in args:
                Path(args[-2]).write_text('source bundle')
            return ''
        if tool == 'docker':
            if 'inspect' in args:
                if '.State.Health' in args[3]:
                    return 'healthy'
                return 'true' if '{{.State.Running}}' in args else json.dumps([{'Source': str(self.uploads), 'Destination': '/app/server/local-uploads'}])
            if 'ps' in args:
                return 'container'
        if tool == 'mongodump':
            Path(next(arg.split('=', 1)[1] for arg in args if arg.startswith('--archive='))).write_text('database')
        if tool == 'age':
            # Tests orchestration and manifest checks; real encryption is a required drill.
            Path(args[args.index('-o') + 1]).write_bytes(Path(args[-1]).read_bytes())
        if tool == 'rclone' and 'copyto' in args:
            self.remote.write_bytes(Path(args[args.index('copyto') + 1]).read_bytes())
        return ''

    def execute(self):
        with patch.object(recovery, 'run', self.fake_run), patch.object(recovery.shutil, 'which', return_value='/test/tool'):
            recovery.backup(self.cfg, allow_write_pause=True)

    def test_success_resumes_before_transfer_and_verifies_complete_bundle(self):
        self.execute()
        start = next(i for i, args in enumerate(self.calls) if 'start' in args)
        encrypt = next(i for i, args in enumerate(self.calls) if args[0] == 'age')
        self.assertLess(start, encrypt)
        status = json.loads((Path(self.cfg['backup_directory']) / 'last-success.json').read_text())
        self.assertEqual(status['commit'], 'a' * 40)
        output = self.root / 'restore'
        with patch.object(recovery, 'run', self.fake_run):
            recovery.verify_and_unpack(str(self.remote), 'test-only', str(output))
        self.assertEqual((output / 'database.archive.gz').read_text(), 'database')
        self.assertFalse(list(Path(self.cfg['backup_directory']).glob('.recovery-*')))

    def test_dump_failure_resumes_application_and_never_publishes_success(self):
        self.failure = 'mongodump'
        with self.assertRaises(RuntimeError):
            self.execute()
        self.assertTrue(any('start' in args for args in self.calls))
        self.assertFalse((Path(self.cfg['backup_directory']) / 'last-success.json').exists())
        self.assertFalse(list(Path(self.cfg['backup_directory']).glob('.recovery-*')))

    def test_external_verification_failure_keeps_encrypted_copy_but_no_success(self):
        self.failure = 'check'
        with self.assertRaises(RuntimeError):
            self.execute()
        directory = Path(self.cfg['backup_directory'])
        self.assertTrue(list(directory.glob('recovery-*.tar.age')))
        self.assertFalse((directory / 'last-success.json').exists())

    def test_failed_resume_preserves_marker_for_service_recovery(self):
        self.failure = 'start'
        with self.assertRaises(RuntimeError):
            self.execute()
        self.assertTrue((Path(self.cfg['backup_directory']) / '.app-paused').exists())
        self.failure = None
        with patch.object(recovery, 'run', self.fake_run):
            recovery.resume(self.cfg)
        self.assertFalse((Path(self.cfg['backup_directory']) / '.app-paused').exists())

    def test_write_pause_requires_explicit_authorization(self):
        with self.assertRaises(ValueError):
            recovery.backup(self.cfg)
        self.assertFalse(self.calls)

    def test_unpack_rejects_path_traversal_without_writing_outside_output(self):
        malicious = self.root / 'malicious.tar'
        with tarfile.open(malicious, 'w') as archive:
            member = tarfile.TarInfo('../outside')
            member.size = 3
            archive.addfile(member, io.BytesIO(b'bad'))
        output = self.root / 'restore'
        with patch.object(recovery, 'run', self.fake_run), self.assertRaises(ValueError):
            recovery.verify_and_unpack(str(malicious), 'test-only', str(output))
        self.assertFalse(output.exists())
        self.assertFalse((self.root / 'outside').exists())


if __name__ == '__main__':
    unittest.main()
