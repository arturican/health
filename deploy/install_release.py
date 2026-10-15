#!/usr/bin/python3
"""Restricted SSH receiver for the Health Diary static build (Python 3.12+)."""
import fcntl
import io
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile
import tempfile

MAX_ARCHIVE = 20 * 1024 * 1024
MAX_CONTENT = 50 * 1024 * 1024
BASE = Path('/var/www/health')


def read_build(stream):
    archive = stream.read(MAX_ARCHIVE + 1)
    if not archive or len(archive) > MAX_ARCHIVE:
        raise ValueError('Archive is empty or exceeds 20 MiB')
    files = {}
    total = 0
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as bundle:
        for count, member in enumerate(bundle):
            if count >= 1000:
                raise ValueError('Too many archive entries')
            name = member.name.removeprefix('./')
            if member.isdir() and name in ('', '.', 'assets'):
                continue
            allowed = name in ('index.html', 'favicon.svg') or re.fullmatch(r'assets/[A-Za-z0-9][A-Za-z0-9_.-]*', name)
            if not member.isfile() or not allowed or name in files:
                raise ValueError('Invalid or duplicate archive entry')
            total += member.size
            if member.size < 0 or total > MAX_CONTENT:
                raise ValueError('Build exceeds 50 MiB')
            source = bundle.extractfile(member)
            if source is None:
                raise ValueError('Missing file bytes')
            files[name] = source.read()
    if not files.get('index.html') or not any(name.endswith('.js') for name in files):
        raise ValueError('Build must include index.html and JavaScript')
    return files


def replace_link(base, name, target):
    temporary = base / (name + '.next')
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    temporary.replace(base / name)


def install(stream, revision, base=BASE):
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Expected a full Git commit SHA')
    files = read_build(stream)
    base.mkdir(parents=True, exist_ok=True)
    with (base / '.deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        releases = base / 'releases'
        releases.mkdir(exist_ok=True)
        assets = base / 'assets'
        assets.mkdir(exist_ok=True)
        release = releases / revision
        # Assets from older releases remain available to already opened pages.
        for name, data in files.items():
            if name.startswith('assets/'):
                asset = base / name
                if asset.exists() and asset.read_bytes() != data:
                    raise ValueError('Asset name collision')
        files['release.txt'] = (revision + '\n').encode()
        if release.exists():
            existing = {str(path.relative_to(release)): path.read_bytes()
                        for path in release.rglob('*') if path.is_file()}
            if existing != files:
                raise ValueError('Release already exists with different content')
        else:
            staging = Path(tempfile.mkdtemp(prefix='.incoming-', dir=releases))
            try:
                staging.chmod(0o755)
                for name, data in files.items():
                    target = staging / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    target.chmod(0o644)
                staging.rename(release)
            finally:
                if staging.exists():
                    shutil.rmtree(staging)
        for name, data in files.items():
            if name.startswith('assets/') and not (base / name).exists():
                # Hard links publish complete immutable files in one operation.
                os.link(release / name, base / name)
        current = base / 'current'
        if current.is_symlink() and current.resolve() != release:
            replace_link(base, 'previous', os.readlink(current))
        replace_link(base, 'current', 'releases/' + revision)
    return revision


def main():
    command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
    match = re.fullmatch(r'deploy ([0-9a-f]{40})', command)
    if match is None:
        raise ValueError('Only deploy <commit SHA> is allowed')
    os.umask(0o022)
    print('Deployed ' + install(sys.stdin.buffer, match[1]), flush=True)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, tarfile.TarError) as error:
        print('Deployment rejected: ' + str(error), file=sys.stderr)
        sys.exit(1)
