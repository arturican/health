import contextlib
import io
import json
import unittest
from unittest.mock import patch

import check_mail


class CheckMailDnsTests(unittest.TestCase):
    def run_check(self, format_txt, missing=None, wrong_key=False, host="data", sender_ips=None, duplicate_spf=False):
        key = 'v=DKIM1; p=SyntheticPublicKey'
        selector = 'healthmonitor2026' if host == 'monitor' else 'health2026'
        ip = '159.194.208.200' if host == 'monitor' else '2.26.54.81'
        records = {'dkim_name': selector + '._domainkey.auth.arturican.com', 'dkim_value': key}
        if sender_ips is not None:
            records['sender_ips'] = sender_ips
        spf = 'v=spf1 ' + ' '.join('ip4:' + value for value in (sender_ips or ['2.26.54.81'])) + ' -all'
        values = [
            ip, '2.26.54.81',
            'v=spf1 ip4:' + ip + ' -all', spf,
            'v=DMARC1; p=reject; adkim=s; aspf=s', key, ('mail-monitor.arturican.com.' if host == 'monitor' else 'mail.arturican.com.'),
        ]
        responses = []
        for index, value in enumerate(values):
            if wrong_key and index == 5:
                value = 'v=DKIM1; p=AnotherSyntheticKey'
            if 2 <= index <= 5:
                value = format_txt(value)
            answer = [] if missing == index else [{'data': value}]
            if duplicate_spf and index == 3:
                answer.append({'data': format_txt('v=spf1 +all')})
            responses.append(io.BytesIO(json.dumps({'Answer': answer}).encode()))
        with patch.object(check_mail.Path, 'read_text', return_value=json.dumps(records)), \
                patch.object(check_mail.urllib.request, 'urlopen', side_effect=responses), \
                patch.object(check_mail, 'command') as command, \
                contextlib.redirect_stdout(io.StringIO()):
            if host == 'data':
                check_mail.check_dns()
            else:
                check_mail.check_dns(host=host)
            command.assert_called_once_with('opendkim-testkey', '-d', 'auth.arturican.com',
                                           '-s', selector, '-k', '/etc/opendkim/keys/auth.arturican.com/' + selector + '.private')

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


    def test_monitor_profile_validates_its_own_identity(self):
        self.run_check(lambda value: value, host='monitor',
                       sender_ips=['2.26.54.81','159.194.208.200'])

    def test_monitor_missing_records_block_each_step(self):
        for index in range(7):
            with self.subTest(index=index), self.assertRaises(SystemExit):
                self.run_check(lambda value: value, host='monitor',
                               sender_ips=['2.26.54.81','159.194.208.200'], missing=index)

    def test_monitor_requires_explicit_shared_sender_spf(self):
        with self.assertRaises((ValueError,AssertionError)):
            self.run_check(lambda value: value, host='monitor')

    def test_data_gate_supports_explicit_two_host_spf(self):
        self.run_check(lambda value: value, sender_ips=['2.26.54.81','159.194.208.200'])

    def test_unknown_sender_ip_is_rejected_before_dns(self):
        with self.assertRaises((ValueError,AssertionError)):
            self.run_check(lambda value: value, sender_ips=['2.26.54.81','203.0.113.9'])

    def test_second_spf_record_is_not_accepted(self):
        with self.assertRaises(SystemExit):
            self.run_check(lambda value: value, duplicate_spf=True)

    def test_wrong_monitor_key_still_blocks_activation(self):
        with self.assertRaisesRegex(SystemExit,'healthmonitor2026'):
            self.run_check(lambda value: value, host='monitor',
                           sender_ips=['2.26.54.81','159.194.208.200'], wrong_key=True)


class CheckMailLocalSafetyTests(unittest.TestCase):
    def test_independence_is_checked_before_smtp_fixture(self):
        configured = {
            'myhostname':'mail-monitor.arturican.com','inet_interfaces':'127.0.0.1',
            'mynetworks':'127.0.0.1/32','smtp_tls_security_level':'verify',
            'milter_default_action':'tempfail','defer_transports':'smtp',
            'relayhost':'','transport_maps':'','sender_dependent_relayhost_maps':'',
            'smtp_fallback_relay':'','sender_dependent_default_transport_maps':'',
            'default_transport':'smtp',
        }
        for key in ('relayhost','transport_maps','sender_dependent_relayhost_maps',
                    'smtp_fallback_relay','sender_dependent_default_transport_maps','default_transport'):
            with self.subTest(key=key):
                values = {**configured,key:'synthetic-unwanted-routing'}
                def command(*args):
                    if args[:2] != ('postconf','-h'):
                        raise RuntimeError('Unexpected progress past bad routing')
                    return values[args[2]].encode()
                with patch.object(check_mail,'command',side_effect=command) as mock_command, \
                        patch.object(check_mail.smtplib,'SMTP') as smtp, self.assertRaises(AssertionError):
                    check_mail.check(host='monitor')
                self.assertEqual(mock_command.call_args.args,('postconf','-h',key))
                smtp.assert_not_called()
