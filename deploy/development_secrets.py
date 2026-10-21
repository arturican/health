#!/usr/bin/python3
"""Forced SSH command for development secrets; never a shell or generic SOPS proxy."""
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path('/var/lib/health-dev-secrets')
SOPS = '/usr/local/lib/health-dev-secrets/sops'
NAMES = {'DEV_POSTGRES_PASSWORD', 'DEV_APP_PASSWORD', 'DEV_MIGRATOR_PASSWORD', 'DEV_DEMO_PASSWORD'}


def validate(payload):
    values = {}
    for line in payload.decode('ascii').splitlines():
        match = re.fullmatch(r'(DEV_[A-Z_]+)=([A-Za-z0-9_-]{15,})', line)
        if not match or match[1] in values:
            raise ValueError('Invalid development settings')
        values[match[1]] = match[2]
    if set(values) != NAMES:
        raise ValueError('Invalid development settings')
    return payload


def process(operation, payload):
    if operation not in ('decrypt-development', 'encrypt-development') or len(payload) > 65536:
        raise ValueError('Invalid request')
    args = [SOPS, 'decrypt' if operation == 'decrypt-development' else 'encrypt',
            '--input-type', 'dotenv', '--output-type', 'dotenv']
    if operation == 'encrypt-development':
        validate(payload)
    recipient = (ROOT / 'recipient.txt').read_text().strip()
    if not re.fullmatch(r'age1[a-z0-9]+', recipient):
        raise ValueError('Invalid recipient')
    if operation == 'decrypt-development':
        entries = [line.split('=', 1) for line in payload.decode('ascii').splitlines()]
        metadata = {'sops_age__list_0__map_enc', 'sops_age__list_0__map_recipient',
                    'sops_lastmodified', 'sops_mac', 'sops_unencrypted_suffix', 'sops_version'}
        if any(len(entry) != 2 for entry in entries):
            raise ValueError('Invalid ciphertext')
        values = dict(entries)
        if len(values) != len(entries) or set(values) != NAMES | metadata:
            raise ValueError('Only development age metadata allowed')
        if values['sops_age__list_0__map_recipient'] != recipient:
            raise ValueError('Different recipient')
    if operation == 'encrypt-development':
        args += ['--age', recipient, '--filename-override', 'secrets/development.enc.env']
    result = subprocess.run(args, input=payload, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, timeout=20, check=False,
                            env={'PATH': '/usr/bin:/bin', 'HOME': str(ROOT),
                                 'SOPS_AGE_KEY_FILE': str(ROOT / 'private/keys.txt')})
    if result.returncode or len(result.stdout) > 131072:
        raise ValueError('SOPS failed')
    if operation == 'decrypt-development':
        validate(result.stdout)
    elif b'sops_mac=ENC[' not in result.stdout:
        raise ValueError('Invalid encrypted output')
    return result.stdout


def main():
    try:
        if len(sys.argv) != 1:
            raise ValueError('No arguments supported')
        result = process(os.environ.get('SSH_ORIGINAL_COMMAND', ''), sys.stdin.buffer.read(65537))
        sys.stdout.buffer.write(result)
    except (ValueError, OSError, subprocess.SubprocessError):
        sys.stderr.write('Development secrets unavailable: check access and input.\n')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
