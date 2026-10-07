import importlib.util
import json
from pathlib import Path
import shutil
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('recovery', Path(__file__).parents[1] / 'disaster-recovery.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


@unittest.skipUnless(shutil.which('age') and shutil.which('age-keygen') and shutil.which('rclone'), 'Requires real age and rclone tools')
class CryptoTests(unittest.TestCase):
    def test_real_encrypt_transfer_verify_decrypt_and_tamper_rejection(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            identity = root / 'test-identity'
            recovery.run(['age-keygen', '-o', str(identity)])
            recipients = root / 'recipients'
            recipients.write_text(recovery.run(['age-keygen', '-y', str(identity)]) + '\n')
            files = ['database.archive.gz', 'uploads.tar.gz', 'configuration.tar.gz', 'source.bundle']
            for name in files:
                (root / name).write_text('synthetic test fixture')
            recovery.write_json(root / 'manifest.json', {'format': 1, 'commit': 'test-commit', 'files': {name: recovery.sha256(root / name) for name in files}})
            with tarfile.open(root / 'bundle.tar', 'w') as archive:
                for name in files + ['manifest.json']:
                    archive.add(root / name, arcname=name)
            source = root / 'source'
            source.mkdir()
            encrypted = source / 'bundle.tar.age'
            recovery.run(['age', '-R', str(recipients), '-o', str(encrypted), str(root / 'bundle.tar')])
            self.assertNotIn(b'synthetic test fixture', encrypted.read_bytes())
            remote = root / 'external'
            remote.mkdir()
            config = root / 'rclone.conf'
            config.write_text('[qa]\ntype = alias\nremote = ' + str(remote) + '\n')
            recovery.run(['rclone', '--config', str(config), 'copyto', str(encrypted), 'qa:bundle.tar.age', '--immutable'])
            recovery.run(['rclone', '--config', str(config), 'check', str(source), 'qa:', '--one-way', '--download'])
            output = root / 'verified'
            recovery.verify_and_unpack(str(remote / encrypted.name), str(identity), str(output))
            self.assertEqual(json.loads((output / 'manifest.json').read_text())['commit'], 'test-commit')
            tampered = bytearray((remote / encrypted.name).read_bytes())
            tampered[-1] ^= 1
            (remote / encrypted.name).write_bytes(tampered)
            with self.assertRaises(RuntimeError):
                recovery.verify_and_unpack(str(remote / encrypted.name), str(identity), str(root / 'tampered'))
            self.assertFalse((root / 'tampered').exists())
            with self.assertRaises(RuntimeError):
                recovery.run(['rclone', '--config', str(config), 'check', str(source), 'qa:', '--one-way', '--download'])


if __name__ == '__main__':
    unittest.main()
