import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('setup_uptime', Path(__file__).parents[1] / 'configure-uptimerobot.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class SetupTests(unittest.TestCase):
    def test_preserves_config_and_rejects_other_destinations(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'recovery.json'
            path.write_text('{"remote": "organisation-backups:GTVET-WEL/recovery"}')
            path.chmod(0o600)
            original = path.read_bytes()
            for url in ('http://heartbeat.uptimerobot.com/token', 'https://example.com/token', 'https://heartbeat.uptimerobot.com/', 'https://user@heartbeat.uptimerobot.com/token', 'https://heartbeat.uptimerobot.com:invalid/token'):
                with self.assertRaises(ValueError):
                    setup.save_url(path, url)
                self.assertEqual(path.read_bytes(), original)
            setup.save_url(path, 'https://heartbeat.uptimerobot.com/test-only-token')
            cfg = json.loads(path.read_text())
            self.assertEqual(cfg['remote'], 'organisation-backups:GTVET-WEL/recovery')
            self.assertEqual(cfg['uptimerobot_heartbeat_url'], 'https://heartbeat.uptimerobot.com/test-only-token')
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(list(path.parent.glob('.uptimerobot-*')), [])


if __name__ == '__main__':
    unittest.main()
