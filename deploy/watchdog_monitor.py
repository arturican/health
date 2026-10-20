#!/usr/bin/env python3
"""Independent API watchdog artifact; state and email require --send."""
import argparse
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import format_datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import smtplib
import stat
import subprocess
import sys
from backup_monitor import private_json, validate_config, write_state
from watchdog_probe import deadline, DeadlineExceeded

STATUSES = ("healthy", "unhealthy")


def read_state(path, recipient_hash):
    try:
        state = private_json(path, 1024)
    except FileNotFoundError:
        return {"candidate": "healthy", "count": 0, "notified": None, "recipient_hash": recipient_hash}
    if (not isinstance(state, dict) or set(state) != {"candidate", "count", "notified", "recipient_hash"}
            or state["candidate"] not in STATUSES or type(state["count"]) is not int
            or not 0 <= state["count"] <= 2 or state["notified"] not in (*STATUSES, None)
            or not isinstance(state["recipient_hash"], str)
            or not re.fullmatch(r"[a-f0-9]{64}", state["recipient_hash"])):
        raise ValueError("Invalid watchdog state")
    return state if state["recipient_hash"] == recipient_hash else {
        "candidate": "healthy", "count": 0, "notified": None, "recipient_hash": recipient_hash}


def notify(config, status):
    message = EmailMessage()
    message["From"] = "no-reply@auth.arturican.com"
    message["To"] = config["recipient"]
    message["Date"] = format_datetime(datetime.now(timezone.utc))
    message["Subject"] = ("Дневник здоровья: доступность восстановлена" if status == "healthy"
                          else "Дневник здоровья: API недоступен")
    message.set_content("Два последовательных наблюдения: " + status + ".\n"
                        "Проверьте API и туннель по инструкции DEPLOYMENT.\n")
    with smtplib.SMTP("127.0.0.1", config["smtp_port"], timeout=10) as smtp:
        if smtp.send_message(message):
            raise ValueError("SMTP rejected recipient")


def check():
    unknown = {"version": 1, "status": "unhealthy", "health": "unknown", "readiness": "unknown"}
    try:
        result = subprocess.run([sys.executable, "-B", str(Path(__file__).with_name("watchdog_probe.py"))],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=17, check=False)
        if len(result.stdout) > 1024:
            return unknown
        report = json.loads(result.stdout)
        if (type(report) is not dict or set(report) != set(unknown) or type(report["version"]) is not int
                or report["version"] != 1 or report["status"] not in STATUSES
                or report["health"] not in ("ok", "unavailable", "invalid_response", "unknown")
                or report["readiness"] not in ("ready", "not_ready", "unavailable", "invalid_response", "unknown")
                or (report["status"] == "healthy") != (report["health"] == "ok" and report["readiness"] == "ready")
                or result.returncode != (0 if report["status"] == "healthy" else 1)):
            return unknown
        return report
    except (subprocess.TimeoutExpired, ValueError, UnicodeError):
        return unknown


def observe():
    return check()


def monitor(config, send=False):
    if not send:
        return {**observe(), "notification": "disabled"}
    directory = config["state_directory"]
    details = directory.stat()
    if (directory.resolve() != directory or not stat.S_ISDIR(details.st_mode)
            or details.st_mode & 0o077 or details.st_uid != os.geteuid()):
        raise ValueError("Invalid state directory")
    descriptor = os.open(directory / ".watchdog.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as lock:
        info = os.fstat(lock.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.geteuid():
            raise ValueError("Invalid state lock")
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = directory / "watchdog.json"
        state = read_state(path, hashlib.sha256(config["recipient"].encode()).hexdigest())
        report = dict(observe())
        current = report["status"]
        state["count"] = min(2, state["count"] + 1) if state["candidate"] == current else 1
        state["candidate"] = current
        report["notification"] = "pending"
        if state["count"] == 2:
            report["notification"] = "unchanged"
            if state["notified"] != current:
                if current == "unhealthy" or state["notified"] is not None:
                    notify(config, current)
                    report["notification"] = "sent"
                else:
                    report["notification"] = "initial_healthy"
                state["notified"] = current
        write_state(path, state)
        return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--send", action="store_true")
    args = parser.parse_args(argv)
    try:
        config = validate_config(private_json(args.config, 8192))
        report = monitor(config, args.send)
        print(json.dumps(report))
        return 0 if report["status"] == "healthy" else 1
    except Exception:
        sys.stderr.write("Watchdog failed; inspect private config, state and independent SMTP\n")
        return 2


if __name__ == "__main__":
    os.umask(0o077)
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(45)
    raise SystemExit(main())
