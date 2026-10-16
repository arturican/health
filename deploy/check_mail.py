#!/usr/bin/env python3
"""Run as root on the mail VPS; sends only a reserved .invalid fixture."""
import base64
import hashlib
import json
from pathlib import Path
import re
import smtplib
import subprocess
import tempfile
import time
import sys
import urllib.parse
import urllib.request
from email.parser import BytesParser
from email.policy import default


def command(*args, data=None):
    return subprocess.check_output(args, input=data, stderr=subprocess.STDOUT)


def relaxed_header(name, value):
    return name.lower() + ':' + re.sub(r'\s+', ' ', value).strip() + '\r\n'


def verify_signature(raw):
    message = BytesParser(policy=default).parsebytes(raw)
    signature = str(message['DKIM-Signature'])
    tags = dict(part.strip().split('=', 1) for part in signature.split(';') if '=' in part)
    assert tags['d'] == 'auth.arturican.com'
    assert tags['s'] == 'health2026'
    assert tags['a'] == 'rsa-sha256' and tags['c'] == 'relaxed/relaxed'
    body = message.get_payload(decode=True)
    assert isinstance(body, bytes)
    lines = [re.sub(rb'[ \t]+', b' ', line).rstrip(b' \t') for line in body.replace(b'\r\n', b'\n').split(b'\n')]
    canonical_body = b'\r\n'.join(lines).rstrip(b'\r\n') + b'\r\n'
    assert base64.b64encode(hashlib.sha256(canonical_body).digest()).decode() == tags['bh'].strip()
    headers = list(message.raw_items())
    signed = ''
    for name in tags['h'].replace(' ', '').split(':'):
        for index in range(len(headers) - 1, -1, -1):
            if headers[index][0].lower() == name.lower():
                signed += relaxed_header(*headers.pop(index))
                break
    original = next(value for name, value in message.raw_items() if name.lower() == 'dkim-signature')
    unsigned = re.sub(r'\bb=[^;]*', 'b=', original)
    signed += relaxed_header('DKIM-Signature', unsigned).removesuffix('\r\n')
    dns = json.loads(Path('/etc/health-diary/mail-dns.json').read_text())
    public = re.search(r'\bp=([A-Za-z0-9+/=]+)', dns['dkim_value'])
    assert public is not None
    public_pem = command('openssl', 'pkey', '-pubin', '-inform', 'DER', data=base64.b64decode(public[1]))
    with tempfile.TemporaryDirectory(prefix='health-mail-check-') as temporary:
        key, encoded = Path(temporary) / 'public.pem', Path(temporary) / 'signature'
        key.write_bytes(public_pem)
        encoded.write_bytes(base64.b64decode(re.sub(r'\s', '', tags['b'])))
        assert b'Verified OK' in command('openssl', 'dgst', '-sha256', '-verify', str(key), '-signature', str(encoded), data=signed.encode())


def check():
    for key, expected in [('inet_interfaces', '127.0.0.1'), ('mynetworks', '127.0.0.1/32'),
                          ('smtp_tls_security_level', 'verify'), ('milter_default_action', 'tempfail'),
                          ('defer_transports', 'smtp')]:
        assert command('postconf', '-h', key).decode().strip() == expected
    listeners = command('ss', '-lntH').decode().splitlines()
    for port in ['25', '8891']:
        sockets = [line.split()[3] for line in listeners if line.split()[3].endswith(':' + port)]
        assert sockets == ['127.0.0.1:' + port], sockets
    for unit in ['postfix@-.service', 'opendkim.service']:
        assert b'~@' in command('systemctl', 'show', unit, '-p', 'LogFilterPatterns', '--value')
    started = str(int(time.time()))
    recipient = 'synthetic-health@example.invalid'
    with smtplib.SMTP('127.0.0.1', 25, timeout=10) as smtp:
        smtp.ehlo('audit.example.invalid')
        smtp.mail('forged@example.invalid')
        code, _ = smtp.rcpt(recipient)
        assert code >= 500, 'Unexpected sender accepted'
    queue_id = None
    try:
        with smtplib.SMTP('127.0.0.1', 25, timeout=10) as smtp:
            smtp.ehlo('audit.example.invalid')
            assert smtp.mail('no-reply@auth.arturican.com')[0] == 250
            assert smtp.rcpt(recipient)[0] == 250
            code, response = smtp.data('From: no-reply@auth.arturican.com\r\nTo: synthetic-health@example.invalid\r\nSubject: Synthetic mail installation check\r\n\r\nSynthetic fixture only. No recovery link or personal data.\r\n')
            assert code == 250
            match = re.search(rb'queued as ([A-F0-9]+)', response)
            assert match is not None
            queue_id = match[1].decode()
        verify_signature(command('postcat', '-bhq', queue_id))
    finally:
        if queue_id:
            assert re.fullmatch(r'[A-F0-9]{5,20}', queue_id)
            command('postsuper', '-d', queue_id)
    command('journalctl', '--sync')
    journal = command('journalctl', '--since', '@' + started, '--no-pager', '-o', 'cat')
    assert recipient.encode() not in journal and b'forged@example.invalid' not in journal
    assert b'"status":"ok"' in command('curl', '--fail', '--silent', 'http://127.0.0.1:3101/api/v1/health')
    command('docker', 'exec', 'remnawave-db', 'pg_isready', '-U', 'postgres', '-d', 'health')
    print('PASS: loopback, sender restriction, mandatory TLS, DKIM RSA/body hash, queue cleanup, log privacy, API and PostgreSQL')


def check_dns():
    records = json.loads(Path('/etc/health-diary/mail-dns.json').read_text())
    expected = [
        ('mail.arturican.com', 'A', '2.26.54.81'),
        ('auth.arturican.com', 'A', '2.26.54.81'),
        ('mail.arturican.com', 'TXT', 'v=spf1 ip4:2.26.54.81 -all'),
        ('auth.arturican.com', 'TXT', 'v=spf1 ip4:2.26.54.81 -all'),
        ('_dmarc.auth.arturican.com', 'TXT', 'v=DMARC1; p=reject; adkim=s; aspf=s'),
        (records['dkim_name'], 'TXT', records['dkim_value']),
        ('81.54.26.2.in-addr.arpa', 'PTR', 'mail.arturican.com'),
    ]
    missing = []
    for name, kind, value in expected:
        query = urllib.parse.urlencode({'name': name, 'type': kind})
        with urllib.request.urlopen('https://dns.google/resolve?' + query, timeout=15) as response:
            data = json.load(response)
        answers = [entry['data'] for entry in data.get('Answer', [])]
        if kind == 'TXT':
            answers = [''.join(re.findall(r'"([^\"]*)"', answer)) if answer.startswith('"') else answer for answer in answers]
        if value not in [answer.rstrip('.') for answer in answers]:
            missing.append(name + ' ' + kind)
    if missing:
        raise SystemExit('DNS pending: ' + ', '.join(missing))
    command('opendkim-testkey', '-d', 'auth.arturican.com', '-s', 'health2026',
            '-k', '/etc/opendkim/keys/auth.arturican.com/health2026.private')
    print('PASS: public A/SPF/DKIM/DMARC/PTR and matching signing key')


if __name__ == '__main__':
    if sys.argv[1:] == ['--dns']:
        check_dns()
    elif not sys.argv[1:]:
        check()
    else:
        raise SystemExit('Usage: check_mail.py [--dns]')
