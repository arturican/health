import contextlib
import io
import json
import unittest
from unittest.mock import patch

import check_mail


class CheckMailDnsTests(unittest.TestCase):
    def run_check(self, format_txt, missing=None, wrong_key=False):
        key = 'v=DKIM1; p=SyntheticPublicKey'
        records = {'dkim_name': 'health2026._domainkey.auth.arturican.com', 'dkim_value': key}
        values = [
            '2.26.54.81', '2.26.54.81',
            'v=spf1 ip4:2.26.54.81 -all', 'v=spf1 ip4:2.26.54.81 -all',
            'v=DMARC1; p=reject; adkim=s; aspf=s', key, 'mail.arturican.com.',
        ]
        responses = []
        for index, value in enumerate(values):
            if wrong_key and index == 5:
                value = 'v=DKIM1; p=AnotherSyntheticKey'
            if 2 <= index <= 5:
                value = format_txt(value)
            answer = [] if missing == index else [{'data': value}]
            responses.append(io.BytesIO(json.dumps({'Answer': answer}).encode()))
        with patch.object(check_mail.Path, 'read_text', return_value=json.dumps(records)), \
                patch.object(check_mail.urllib.request, 'urlopen', side_effect=responses), \
                patch.object(check_mail, 'command') as command, \
                contextlib.redirect_stdout(io.StringIO()):
            check_mail.check_dns()
            command.assert_called_once_with('opendkim-testkey', '-d', 'auth.arturican.com',
                                           '-s', 'health2026', '-k', '/etc/opendkim/keys/auth.arturican.com/health2026.private')

    def test_accepts_unquoted_google_dns_json(self):
        self.run_check(lambda value: value)

    def test_accepts_quoted_and_split_txt(self):
        for quote in [lambda value: '"' + value + '"',
                      lambda value: '"' + value[:10] + '" "' + value[10:] + '"']:
            with self.subTest(quote=quote):
                self.run_check(quote)

    def test_missing_records_still_block_activation(self):
        for index in range(7):
            with self.subTest(index=index), self.assertRaisesRegex(SystemExit, 'DNS pending:'):
                self.run_check(lambda value: value, missing=index)

    def test_wrong_dkim_record_still_blocks_activation(self):
        with self.assertRaisesRegex(SystemExit, 'health2026._domainkey.auth.arturican.com TXT'):
            self.run_check(lambda value: value, wrong_key=True)
