import importlib.util
import io
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


def module(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


helper = module('development_secrets')
installer = module('install_development_secrets')
PLAIN = b''.join(name.encode() + b'=synthetic-password-only\n' for name in sorted(helper.NAMES))
CIPHER = b''.join(name.encode() + b'=ENC[synthetic]\n' for name in sorted(helper.NAMES)) + (
    b'sops_age__list_0__map_recipient=age1syntheticrecipient\n'
    b'sops_age__list_0__map_enc=synthetic\nsops_lastmodified=synthetic\n'
    b'sops_mac=ENC[synthetic]\nsops_unencrypted_suffix=_unencrypted\nsops_version=3.13.3\n')


class DevelopmentSecretsTest(unittest.TestCase):
    def test_validated_roundtrip_dispatch_and_minimal_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'recipient.txt').write_text('age1syntheticrecipient\n')
            with patch.object(helper, 'ROOT', root), patch.object(helper.subprocess, 'run') as run:
                run.return_value = subprocess.CompletedProcess([], 0, PLAIN)
                self.assertEqual(helper.process('decrypt-development', CIPHER), PLAIN)
                self.assertEqual(run.call_args.args[0][1], 'decrypt')
                self.assertEqual(set(run.call_args.kwargs['env']), {'PATH', 'HOME', 'SOPS_AGE_KEY_FILE'})
                self.assertEqual(run.call_args.kwargs['input'], CIPHER)
                run.return_value = subprocess.CompletedProcess([], 0, b'sops_mac=ENC[synthetic]')
                self.assertEqual(helper.process('encrypt-development', PLAIN), b'sops_mac=ENC[synthetic]')
                self.assertIn('--filename-override', run.call_args.args[0])
                self.assertNotIn('synthetic-password-only', ' '.join(run.call_args.args[0]))

    def test_invalid_commands_size_fields_and_partial_child_output(self):
        for operation, payload in [('cat /etc/health-diary/api.env', PLAIN),
                                   ('decrypt-development', b'x' * 65537),
                                   ('encrypt-development', PLAIN + b'PRODUCTION_PASSWORD=forbidden\n'),
                                   ('encrypt-development', PLAIN + PLAIN),
                                   ('encrypt-development', b'')]:
            with self.subTest(operation=operation), patch.object(helper.subprocess, 'run') as run:
                with self.assertRaises(ValueError):
                    helper.process(operation, payload)
                run.assert_not_called()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'recipient.txt').write_text('age1syntheticrecipient')
            with patch.object(helper, 'ROOT', root):
                for invalid in [CIPHER + b'sops_hc_vault=forbidden\n', CIPHER.replace(b'age1syntheticrecipient', b'age1other')]:
                    with self.assertRaises(ValueError), patch.object(helper.subprocess, 'run') as run:
                        helper.process('decrypt-development', invalid)
                    run.assert_not_called()
                for result in [subprocess.CompletedProcess([], 1, PLAIN),
                               subprocess.CompletedProcess([], 0, b'DATABASE_URL=unexpected')]:
                    with patch.object(helper.subprocess, 'run', return_value=result):
                        with self.assertRaises(ValueError):
                            helper.process('decrypt-development', CIPHER)

    def test_main_suppresses_all_partial_output_on_error(self):
        output = io.BytesIO()
        error = io.StringIO()
        with tempfile.TemporaryDirectory() as directory:
            self.check_partial_output(Path(directory), output, error)

    def check_partial_output(self, root, output, error):
        (root / 'recipient.txt').write_text('age1syntheticrecipient')
        with patch.object(helper, 'ROOT', root), patch.object(helper.sys, 'argv', ['helper']), \
             patch.object(helper.sys, 'stdin', SimpleNamespace(buffer=io.BytesIO(CIPHER))), \
             patch.object(helper.sys, 'stdout', SimpleNamespace(buffer=output)), \
             patch.object(helper.sys, 'stderr', error), \
             patch.dict(helper.os.environ, {'SSH_ORIGINAL_COMMAND': 'decrypt-development'}), \
             patch.object(helper.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, PLAIN)):
            self.assertEqual(helper.main(), 1)
        self.assertEqual(output.getvalue(), b'')
        self.assertNotIn('synthetic-password-only', error.getvalue())

    def test_installer_never_replaces_different_key(self):
        with tempfile.TemporaryDirectory() as directory:
            key = Path(directory) / 'keys.txt'
            key.write_bytes(b'existing-synthetic-private-value')
            key.chmod(0o600)
            installer.keep_key(key, key.read_bytes(), key.stat().st_uid, key.stat().st_gid)
            with self.assertRaises(ValueError):
                installer.keep_key(key, b'different-synthetic-value', 0, 0)
            self.assertEqual(key.read_bytes(), b'existing-synthetic-private-value')


if __name__ == '__main__':
    unittest.main()
