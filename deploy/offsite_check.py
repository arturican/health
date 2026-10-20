#!/usr/bin/env python3
"""Read-only ciphertext integrity against receiver-attested SHA; no decryption."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
from backup_check import archive_status, positive_hours
from backup_receive import DIARY_NAME, LIMIT
from watchdog_probe import deadline


def checked_file(path, limit):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    source = os.fdopen(descriptor, "rb")
    info = os.fstat(source.fileno())
    if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= limit or info.st_mode & 0o022:
        source.close()
        raise ValueError("Invalid offsite file")
    return source, info


def check_archive(path):
    try:
        source, _info = checked_file(path.with_name(path.name + ".sha256"), 65)
    except FileNotFoundError:
        return "unattested"
    except (OSError, ValueError):
        return "invalid_manifest"
    with source:
        expected = source.read(66)
    if not re.fullmatch(rb"[a-f0-9]{64}\n", expected):
        return "invalid_manifest"
    try:
        source, before = checked_file(path, LIMIT)
        with source:
            checksum, total = hashlib.sha256(), 0
            while chunk := source.read(1024 * 1024):
                total += len(chunk)
                if total > LIMIT:
                    return "invalid_archive"
                checksum.update(chunk)
            after = os.fstat(source.fileno())
        if total != before.st_size or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            return "invalid_archive"
        return "verified" if checksum.hexdigest().encode() == expected.rstrip(b"\n") else "corrupt"
    except (OSError, ValueError):
        return "invalid_archive"


def check(directory, max_age_hours, now=None):
    freshness = archive_status(directory, max_age_hours, now or datetime.now(timezone.utc))
    report = {"status": "unhealthy", "freshness": freshness["status"],
              "integrity": "unavailable", "verified": 0, "unattested": 0, "failed": 0}
    if freshness["status"] not in ("fresh", "stale"):
        return report
    try:
        descriptor = os.open(directory / ".receive.lock", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as lock:
            if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode):
                raise ValueError("Invalid receiver lock")
            try:
                fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
            except BlockingIOError:
                report["integrity"] = "busy"
                return report
            # Refresh under the receiver lock to avoid treating a pruned latest file as current.
            report["freshness"] = archive_status(directory, max_age_hours, now or datetime.now(timezone.utc))["status"]
            names = sorted(path.name for path in directory.iterdir() if DIARY_NAME.fullmatch(path.name))
            if not names or len(names) > 14:
                report["integrity"] = "invalid_inventory"
                return report
            orphans = any(path.name.endswith(".sha256") and DIARY_NAME.fullmatch(path.name[:-7])
                          and path.name[:-7] not in names for path in directory.iterdir())
            if orphans:
                report["integrity"] = "invalid_inventory"
                return report
            for name in names:
                result = check_archive(directory / name)
                field = result if result in ("verified", "unattested") else "failed"
                report[field] += 1
            report["integrity"] = "failed" if report["failed"] else "unattested" if report["unattested"] else "verified"
            if report["freshness"] == "fresh" and report["integrity"] == "verified":
                report["status"] = "healthy"
            return report
    except (OSError, ValueError):
        return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--max-age-hours", type=positive_hours, required=True)
    args = parser.parse_args(argv)
    try:
        report = check(args.directory, args.max_age_hours)
        print(json.dumps(report))
        return 0 if report["status"] == "healthy" else 1
    except Exception:
        sys.stderr.write("Offsite check failed; inspect local inventory and deadline\n")
        return 2


if __name__ == "__main__":
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(60)
    raise SystemExit(main())
