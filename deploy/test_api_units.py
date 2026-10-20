import configparser
from pathlib import Path
import shutil
import tempfile
import unittest
from verify_api_units import ROOT, verify_api_units


class ApiUnits(unittest.TestCase):
    def test_repository_unit_and_policy_pass_native_parser(self):
        self.assertIn('activation/production executable require VPS', verify_api_units())

    def test_missing_namespace_unbounded_retention_and_forwarding_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in ('health-api.service', 'health-api-journal.conf'):
                shutil.copyfile(ROOT / 'deploy' / name, directory / name)
            unit = directory / 'health-api.service'
            original = unit.read_text()
            unit.write_text(original.replace('LogNamespace=health-diary', 'LogNamespace=other'))
            with self.assertRaisesRegex(ValueError, 'dedicated journal'):
                verify_api_units(directory)
            unit.write_text(original)
            policy = directory / 'health-api-journal.conf'
            original_policy = policy.read_text()
            for invalid in ('MaxRetentionSec=0', 'MaxRetentionSec=8day'):
                policy.write_text(original_policy.replace('MaxRetentionSec=7day', invalid))
                with self.assertRaisesRegex(ValueError, 'bounded'):
                    verify_api_units(directory)
            policy.write_text(original_policy.replace('ForwardToSyslog=no', 'ForwardToSyslog=yes'))
            with self.assertRaisesRegex(ValueError, 'forwarding'):
                verify_api_units(directory)
            policy.write_text(original_policy + 'UnknownOption=yes\n')
            with self.assertRaisesRegex(ValueError, 'fields'):
                verify_api_units(directory)

    def test_api_rate_cannot_be_removed_or_increased(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in ('health-api.service', 'health-api-journal.conf'):
                shutil.copyfile(ROOT / 'deploy' / name, directory / name)
            unit = directory / 'health-api.service'
            original = unit.read_text()
            for source, replacement in [
                ('LogRateLimitBurst=120', 'LogRateLimitBurst=0'),
                ('LogRateLimitBurst=120', 'LogRateLimitBurst=121'),
                ('LogRateLimitBurst=120', ''),
                ('LogRateLimitIntervalSec=60s', 'LogRateLimitIntervalSec=1s'),
            ]:
                with self.subTest(replacement=replacement):
                    unit.write_text(original.replace(source, replacement))
                    with self.assertRaisesRegex(ValueError, 'unit rate'):
                        verify_api_units(directory)

    def test_default_section_cannot_supply_systemd_directives(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            originals = {}
            for name in ('health-api.service', 'health-api-journal.conf'):
                originals[name] = (ROOT / 'deploy' / name).read_text()
                (directory / name).write_text(originals[name])
            for name, section in [('health-api.service', 'Service'), ('health-api-journal.conf', 'Journal')]:
                with self.subTest(name=name):
                    target = directory / name
                    target.write_text(originals[name].replace('[' + section + ']', '[DEFAULT]') + '[' + section + ']\n')
                    with self.assertRaisesRegex(ValueError, 'DEFAULT'):
                        verify_api_units(directory)
                    target.write_text(originals[name])

    def test_malformed_ini_does_not_pass(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / 'health-api.service').write_text('not an ini')
            with self.assertRaises(configparser.Error):
                verify_api_units(directory)


if __name__ == '__main__':
    unittest.main()
