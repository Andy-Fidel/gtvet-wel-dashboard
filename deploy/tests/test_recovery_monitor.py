import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('recovery', Path(__file__).parents[1] / 'disaster-recovery.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class MonitorTests(unittest.TestCase):
    def test_heartbeat_only_follows_healthy_backup_and_application(self):
        with tempfile.TemporaryDirectory() as directory:
            cfg = {'backup_directory': directory, 'uptimerobot_heartbeat_url': 'https://heartbeat.uptimerobot.com/test-only-token', 'public_status_file': str(Path(directory) / 'public' / 'status.json')}
            calls = []
            def request(url, timeout):
                calls.append(url)
                result = io.BytesIO(b'{"status":"ok"}')
                result.status = 200
                return result
            with patch.object(recovery, 'check'), patch.object(recovery.shutil, 'disk_usage', return_value=SimpleNamespace(used=10, total=100)), patch.object(recovery.urllib.request, 'urlopen', side_effect=request):
                recovery.monitor(cfg)
            self.assertEqual(calls[-1], cfg['uptimerobot_heartbeat_url'])
            public_status = Path(cfg['public_status_file'])
            self.assertTrue(json.loads(public_status.read_text())['healthy'])
            self.assertEqual(public_status.stat().st_mode & 0o777, 0o644)
            self.assertEqual(public_status.parent.stat().st_mode & 0o777, 0o755)
            calls.clear()
            with patch.object(recovery, 'check', side_effect=ValueError('stale')), patch.object(recovery.shutil, 'disk_usage', return_value=SimpleNamespace(used=10, total=100)), patch.object(recovery.urllib.request, 'urlopen', side_effect=request), self.assertRaises(ValueError):
                recovery.monitor(cfg)
            self.assertNotIn(cfg['uptimerobot_heartbeat_url'], calls)
            status = json.loads(public_status.read_text())
            self.assertFalse(status['healthy'])
            self.assertEqual(set(status), {'healthy', 'checked_at', 'checks'})

    def test_each_failure_publishes_safe_diagnostics_and_suppresses_heartbeat(self):
        cases = [
            ('external_backup', ValueError('secret backup-name /private/archive'), SimpleNamespace(used=10, total=100), None),
            ('disk_space', None, SimpleNamespace(used=86, total=100), None),
            ('disk_space', None, OSError('/private/backup password=secret'), None),
            ('application', None, SimpleNamespace(used=10, total=100), OSError('credential=secret')),
        ]
        for failed, backup_error, disk, application_error in cases:
            with self.subTest(failed=failed, disk=disk), tempfile.TemporaryDirectory() as directory:
                cfg = {'backup_directory': directory, 'public_status_file': str(Path(directory) / 'status.json'),
                       'uptimerobot_heartbeat_url': 'https://heartbeat.uptimerobot.com/secret'}
                stderr = io.StringIO()
                with patch.object(recovery, 'check', side_effect=backup_error), patch.object(recovery.shutil, 'disk_usage',
                        **({'side_effect': disk} if isinstance(disk, Exception) else {'return_value': disk})), patch.object(
                        recovery.urllib.request, 'urlopen', side_effect=application_error,
                        return_value=io.BytesIO(b'{"status":"ok"}')) as request, patch('sys.stderr', stderr), self.assertRaisesRegex(ValueError, '^Recovery monitoring needs attention$'):
                    recovery.monitor(cfg)
                status = json.loads(Path(cfg['public_status_file']).read_text())
                self.assertFalse(status['healthy'])
                self.assertEqual(status['checks'], {key: key != failed for key in ('external_backup', 'disk_space', 'application')})
                self.assertEqual(request.call_count, 1)
                self.assertNotIn('secret', json.dumps(status) + stderr.getvalue())
                self.assertNotIn(directory, json.dumps(status) + stderr.getvalue())

    def test_heartbeat_failure_does_not_disclose_secret_url(self):
        with tempfile.TemporaryDirectory() as directory:
            cfg = {'backup_directory': directory, 'uptimerobot_heartbeat_url': 'https://heartbeat.uptimerobot.com/test-only-token'}
            def request(url, timeout):
                if 'heartbeat' in url:
                    raise OSError(url)
                return io.BytesIO(b'{"status":"ok"}')
            with patch.object(recovery, 'check'), patch.object(recovery.shutil, 'disk_usage', return_value=SimpleNamespace(used=10, total=100)), patch.object(recovery.urllib.request, 'urlopen', side_effect=request), self.assertRaisesRegex(ValueError, '^UptimeRobot heartbeat delivery failed$'):
                recovery.monitor(cfg)


if __name__ == '__main__':
    unittest.main()
