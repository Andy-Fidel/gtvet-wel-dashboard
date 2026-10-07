import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parents[1] / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

recovery = module('retention_recovery', 'disaster-recovery.py')
lifecycle = module('lifecycle', 'backblaze-lifecycle.py')


class RetentionTests(unittest.TestCase):
    def test_one_daily_and_monthly_copy_with_period_rollover(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / 'recovery-test.tar.age'
            source.write_bytes(b'test ciphertext')
            cfg = {'backup_directory': temporary, 'remote': 'external:recovery'}
            with patch.object(recovery, 'publish_verified_copy') as publish:
                for date in ('2026-10-07', '2026-10-07', '2026-10-08', '2026-11-01'):
                    recovery.publish_retention_points(cfg, source, dt.datetime.fromisoformat(date))
            paths = [call.args[2] for call in publish.call_args_list]
            self.assertEqual(paths, ['external:recovery/daily/2026-10-07.tar.age', 'external:recovery/monthly/2026-10.tar.age', 'external:recovery/daily/2026-10-08.tar.age', 'external:recovery/daily/2026-11-01.tar.age', 'external:recovery/monthly/2026-11.tar.age'])

    def test_failed_copy_retries_original_ciphertext_before_advancing_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            first = Path(temporary) / 'recovery-first.tar.age'
            second = Path(temporary) / 'recovery-second.tar.age'
            first.write_bytes(b'original ciphertext')
            second.write_bytes(b'new ciphertext')
            cfg = {'backup_directory': temporary, 'remote': 'external:recovery'}
            date = dt.datetime(2026, 10, 7)
            with patch.object(recovery, 'publish_verified_copy', side_effect=RuntimeError('verification failed')), self.assertRaises(RuntimeError):
                recovery.publish_retention_points(cfg, first, date)
            state = json.loads((Path(temporary) / 'retention-points.json').read_text())
            self.assertFalse(state['daily']['verified'])
            with patch.object(recovery, 'publish_verified_copy') as publish:
                recovery.publish_retention_points(cfg, second, date)
            self.assertEqual(publish.call_args_list[0].args[1], first)
            self.assertTrue(json.loads((Path(temporary) / 'retention-points.json').read_text())['daily']['verified'])

    def test_scoped_expiry_preserves_unrelated_rules_and_rejects_overlaps(self):
        other = {'fileNamePrefix': 'unrelated/', 'daysFromHidingToDeleting': 50}
        rules = lifecycle.lifecycle_rules([other])
        self.assertIn(other, rules)
        self.assertEqual({r['fileNamePrefix']: r['daysFromUploadingToHiding'] for r in rules if r is not other}, lifecycle.RETENTION)
        self.assertTrue(all(r['daysFromHidingToDeleting'] == 1 for r in rules if r is not other))
        for prefix in ('', 'recovery/', 'recovery/monthly/subset/'):
            with self.assertRaises(ValueError):
                lifecycle.lifecycle_rules([{'fileNamePrefix': prefix}])


if __name__ == '__main__':
    unittest.main()
