#!/usr/bin/python3
"""Operator-only installation in a private staging directory on the secrets VPS."""
import hashlib
import grp
import os
from pathlib import Path
import pwd
import subprocess
import sys
import tempfile

USER = 'health-dev-secrets'
ROOT = Path('/var/lib/health-dev-secrets')
LIB = Path('/usr/local/lib/health-dev-secrets')
HELPER = Path('/usr/local/libexec/health-development-secrets')
SOPS_SHA256 = 'e5bec3346a873ae91d871550f3e698c1aad962aff462a080e40f25fde17fef6b'


def atomic(path, data, mode, uid=0, gid=0):
    descriptor, temp = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
        os.chmod(temp, mode)
        os.chown(temp, uid, gid)
        os.replace(temp, path)
    finally:
        Path(temp).unlink(missing_ok=True)


def keep_key(path, source, uid, gid):
    if path.is_symlink() or (path.exists() and path.read_bytes() != source):
        raise ValueError('Different existing key; no replacement allowed')
    if not path.exists():
        atomic(path, source, 0o600, uid, gid)
    if path.stat().st_mode & 0o077 or path.stat().st_uid != uid:
        raise ValueError('Existing key permissions need review')


def main(source):
    if os.geteuid() != 0:
        raise ValueError('Root operator required')
    sops = (source / 'sops').read_bytes()
    if hashlib.sha256(sops).hexdigest() != SOPS_SHA256:
        raise ValueError('Unexpected SOPS binary')
    public = (source / 'client.pub').read_text().strip().split()
    if len(public) < 2 or '\n' in (source / 'client.pub').read_text().strip():
        raise ValueError('One public key required')
    subprocess.run(['ssh-keygen', '-lf', str(source / 'client.pub')],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    try:
        account = pwd.getpwnam(USER)
    except KeyError:
        subprocess.run(['useradd', '--system', '--user-group', '--home-dir', str(ROOT),
                        '--shell', '/bin/sh', USER], check=True)
        account = pwd.getpwnam(USER)
    if account.pw_dir != str(ROOT) or account.pw_shell != '/bin/sh':
        raise ValueError('Existing account requires review')
    if account.pw_uid == 0 or any(USER in group.gr_mem and group.gr_gid != account.pw_gid for group in grp.getgrall()):
        raise ValueError('Unexpected account privileges')
    authorized = ROOT / '.ssh/authorized_keys'
    previous = authorized.read_text() if authorized.exists() else ''
    prefix = f'restrict,command="{HELPER}" '
    if any(line.strip() and not line.startswith(('#', prefix)) for line in previous.splitlines()):
        raise ValueError('Unexpected authorized_keys entry')
    for directory, mode in [(ROOT, 0o750), (LIB, 0o755), (HELPER.parent, 0o755)]:
        if directory.is_symlink():
            raise ValueError('Symlink destination rejected')
        directory.mkdir(parents=True, exist_ok=True)
        if directory != HELPER.parent:
            directory.chmod(mode)
    os.chown(ROOT, 0, account.pw_gid)
    private = ROOT / 'private'
    if private.is_symlink():
        raise ValueError('Symlink private directory rejected')
    private.mkdir(exist_ok=True)
    os.chown(private, account.pw_uid, account.pw_gid)
    private.chmod(0o700)
    keep_key(private / 'keys.txt', (source / 'keys.txt').read_bytes(), account.pw_uid, account.pw_gid)
    atomic(ROOT / 'recipient.txt', (source / 'recipient.txt').read_bytes(), 0o644)
    atomic(LIB / 'sops', sops, 0o755)
    atomic(HELPER, (source / 'development_secrets.py').read_bytes(), 0o755)
    ssh = ROOT / '.ssh'
    if ssh.is_symlink():
        raise ValueError('Symlink SSH directory rejected')
    ssh.mkdir(exist_ok=True)
    os.chown(ssh, 0, 0)
    ssh.chmod(0o755)
    authorized = ssh / 'authorized_keys'
    if authorized.is_symlink():
        raise ValueError('Symlink authorized_keys rejected')
    entry = f'restrict,command="{HELPER}" {public[0]} {public[1]}'
    if entry not in previous.splitlines():
        atomic(authorized, (previous.rstrip('\n') + '\n' + entry + '\n').encode(), 0o644)
    print('Development-only SSH helper installed; application services unchanged.')


if __name__ == '__main__':
    try:
        main(Path(sys.argv[1]).resolve())
    except (ValueError, OSError, subprocess.SubprocessError):
        sys.stderr.write('Development secrets installation failed; inspect paths/permissions.\n')
        sys.exit(1)
