import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('setup_b2', Path(__file__).parents[1] / 'configure-backblaze.py')
setup_b2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup_b2)


class CredentialTests(unittest.TestCase):
    def test_secret_is_private_and_not_echoed_or_passed_in_command_arguments(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / 'rclone.conf'
            secret = 'synthetic_secret_for_this_test'
            output = io.StringIO()
            with patch.object(setup_b2.os, 'geteuid', return_value=0), patch.object(setup_b2.sys.stdin, 'isatty', return_value=True), patch.object(setup_b2, 'Path', return_value=destination), patch.object(setup_b2.getpass, 'getpass', side_effect=['synthetickey000', secret]), patch.object(setup_b2.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as command, contextlib.redirect_stdout(output):
                self.assertEqual(setup_b2.main([]), 0)
            self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
            self.assertIn(secret, destination.read_text())
            self.assertNotIn(secret, output.getvalue())
            self.assertNotIn(secret, str(command.call_args))
            original = destination.read_bytes()
            with patch.object(setup_b2.os, 'geteuid', return_value=0), patch.object(setup_b2.sys.stdin, 'isatty', return_value=True), patch.object(setup_b2, 'Path', return_value=destination), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(setup_b2.main([]), 1)
            self.assertEqual(destination.read_bytes(), original, 'Existing credentials must never be overwritten')

    def test_replacement_is_published_only_after_successful_verification(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / 'rclone.conf'
            destination.write_text('original credentials')
            for returncode in (1, 0):
                def verify(*args, **kwargs):
                    self.assertEqual(destination.read_text(), 'original credentials')
                    candidate = Path(args[0][2])
                    self.assertEqual(candidate.stat().st_mode & 0o777, 0o600)
                    return SimpleNamespace(returncode=returncode)
                with patch.object(setup_b2.os, 'geteuid', return_value=0), patch.object(setup_b2.sys.stdin, 'isatty', return_value=True), patch.object(setup_b2, 'Path', return_value=destination), patch.object(setup_b2.getpass, 'getpass', side_effect=['synthetickey000', 'synthetic_secret_for_this_test']), patch.object(setup_b2.subprocess, 'run', side_effect=verify), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(setup_b2.main(['--replace']), 1 if returncode else 0)
                self.assertEqual(list(destination.parent.glob('.b2-setup-*')), [])
            self.assertIn('synthetic_secret_for_this_test', destination.read_text())


if __name__ == '__main__':
    unittest.main()
