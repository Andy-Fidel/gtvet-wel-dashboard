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
            self.assertEqual(set(status), {'healthy', 'checked_at'})

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
