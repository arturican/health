#!/usr/bin/env python3
"""Read-only local backup freshness and systemd result check; no archive contents."""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import stat
import subprocess
from backup_receive import DIARY_NAME


def archive_status(directory, max_age_hours, now):
    if not math.isfinite(max_age_hours) or max_age_hours <= 0:
        raise ValueError("Invalid maximum age")
    try:
        if not directory.is_absolute() or directory.resolve() != directory:
            return {"status": "invalid_directory"}
        candidates = sorted((path for path in directory.iterdir()
                             if DIARY_NAME.fullmatch(path.name)), reverse=True)
        if not candidates:
            return {"status": "missing"}
        latest = candidates[0]
        details = latest.lstat()
        if not stat.S_ISREG(details.st_mode) or details.st_size == 0:
            return {"status": "invalid_archive"}
        stamp = latest.name.removeprefix("health-diary-").split("-", 1)[0]
        created = datetime.strptime(stamp, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        age = (now - created).total_seconds()
        if age < 0:
            return {"status": "future_archive"}
        return {"status": "fresh" if age <= max_age_hours * 3600 else "stale",
                "age_seconds": age}
    except ValueError:
        return {"status": "invalid_archive"}
    except (OSError, RuntimeError):
        return {"status": "unavailable"}


def service_status():
    try:
        result = subprocess.run(
            ["systemctl", "show", "health-backup.service", "--no-pager",
             "--property=LoadState", "--property=ActiveState", "--property=Result",
             "--property=ExecMainStatus", "--property=ExecMainStartTimestampMonotonic"],
            capture_output=True, text=True, timeout=10, check=False)
        if result.returncode != 0:
            return {"status": "unavailable"}
        properties = dict(line.split("=", 1) for line in result.stdout.splitlines())
        if properties.get("LoadState") != "loaded":
            return {"status": "unavailable"}
        if properties.get("ActiveState") in ("activating", "deactivating", "active", "reloading"):
            return {"status": "running"}
        started = int(properties["ExecMainStartTimestampMonotonic"])
        if started <= 0:
            return {"status": "not_run"}
        if (properties.get("ActiveState") == "inactive" and properties.get("Result") == "success"
                and properties.get("ExecMainStatus") == "0"):
            return {"status": "success"}
        return {"status": "failed"}
    except (OSError, subprocess.TimeoutExpired, ValueError, KeyError):
        return {"status": "unavailable"}


def positive_hours(value):
    try:
        hours = float(value)
        if math.isfinite(hours) and hours > 0:
            return hours
    except ValueError:
        pass
    raise argparse.ArgumentTypeError("Expected finite positive hours")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--max-age-hours", type=positive_hours, required=True)
    args = parser.parse_args(argv)
    archive = archive_status(args.directory, args.max_age_hours, datetime.now(timezone.utc))
    service = service_status()
    healthy = archive["status"] == "fresh" and service["status"] == "success"
    print(json.dumps({"healthy": healthy, "archive": archive, "service": service}))
    return 0 if healthy else 1


if __name__ == "__main__":
    raise SystemExit(main())
