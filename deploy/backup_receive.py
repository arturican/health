#!/usr/bin/env python3
"""Forced SSH command: accept encrypted bytes only, never extract or decrypt."""
import fcntl
import hashlib
import os
from pathlib import Path
import re
import shutil
import signal
import sys
import tempfile

STAMP = r"[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}"
DIARY_NAME = re.compile(r"health-diary-" + STAMP + r"\.dump\.gpg")
NAME = re.compile(r"(?:health-diary-" + STAMP + r"\.dump|health-cluster-" + STAMP + r"\.sql\.gz)\.gpg")
LIMIT = 2 * 1024**3
RESERVE = 512 * 1024**2


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def prune(directory, keep):
    candidates = sorted((path for path in directory.iterdir()
                         if DIARY_NAME.fullmatch(path.name) and path.is_file()
                         and not path.is_symlink()), reverse=True)
    for path in candidates[keep:]:
        path.unlink()
        (directory / (path.name + ".sha256")).unlink(missing_ok=True)


def attest(target, expected):
    descriptor, temporary = tempfile.mkstemp(prefix=".manifest-", dir=target.parent)
    try:
        with os.fdopen(descriptor, "w") as output:
            output.write(expected + "\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target.with_name(target.name + ".sha256"))
    finally:
        Path(temporary).unlink(missing_ok=True)


def receive(directory, command, source, limit=LIMIT, reserve=RESERVE):
    parts = command.split(" ")
    if len(parts) != 2 or not NAME.fullmatch(parts[0]) or not re.fullmatch(r"[a-f0-9]{64}", parts[1]):
        raise ValueError("Invalid backup command")
    if not directory.is_absolute() or directory.resolve() != directory or not directory.is_dir():
        raise ValueError("Invalid backup directory")
    name, expected = parts
    target = directory / name
    if target.is_symlink():
        raise ValueError("Invalid backup target")
    lock_fd = os.open(directory / ".receive.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, "wb") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        fd, temporary = tempfile.mkstemp(prefix=".receive-", dir=directory)
        temporary = Path(temporary)
        try:
            total, checksum = 0, hashlib.sha256()
            with os.fdopen(fd, "wb") as output:
                while chunk := source.read(1024 * 1024):
                    total += len(chunk)
                    if total > limit or shutil.disk_usage(directory).free - len(chunk) < reserve:
                        raise ValueError("Backup storage limit")
                    checksum.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            if total == 0 or checksum.hexdigest() != expected:
                raise ValueError("Backup checksum mismatch")
            if target.exists():
                if not target.is_file() or digest(target) != expected:
                    raise ValueError("Backup already exists with different contents")
            else:
                os.link(temporary, target)
            temporary.unlink()
            attest(target, expected)
            directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
            prune(directory, 14)
            return expected
        finally:
            temporary.unlink(missing_ok=True)


def timed_out(_signal, _frame):
    raise TimeoutError("Backup deadline exceeded")


if __name__ == "__main__":
    signal.signal(signal.SIGALRM, timed_out)
    os.umask(0o077)
    signal.alarm(600)
    try:
        result = receive(Path("/var/backups/health-diary/offsite"),
                         os.environ.get("SSH_ORIGINAL_COMMAND", ""), sys.stdin.buffer)
        print(result)
    except Exception:
        sys.stderr.write("Encrypted backup rejected\n")
        sys.exit(1)
