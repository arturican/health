#!/usr/bin/env python3
"""Local backup monitor. Email and private state writes require --send."""
import argparse
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import format_datetime
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import signal
import smtplib
import stat
import sys
import tempfile
from backup_check import archive_status, service_status
from backup_receive import timed_out


def private_json(path, limit):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "r") as source:
        info = os.fstat(source.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077
                or info.st_uid != os.geteuid() or info.st_size > limit):
            raise ValueError("Invalid private file")
        text = source.read(limit + 1)
        if len(text) > limit:
            raise ValueError("Private file exceeds limit")
        return json.loads(text)


def validate_config(value):
    fields = {"directory", "state_directory", "max_age_hours", "recipient", "smtp_port"}
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError("Invalid configuration")
    for field in ("directory", "state_directory"):
        if not isinstance(value[field], str) or not Path(value[field]).is_absolute():
            raise ValueError("Invalid directory")
    age, port, recipient = value["max_age_hours"], value["smtp_port"], value["recipient"]
    if (type(age) not in (int, float) or not math.isfinite(age) or age <= 0
            or type(port) is not int or not 1 <= port <= 65535):
        raise ValueError("Invalid limits")
    if (not isinstance(recipient, str) or len(recipient) > 254 or not recipient.isascii()
            or not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+", recipient)):
        raise ValueError("Invalid recipient")
    return {**value, "directory": Path(value["directory"]), "state_directory": Path(value["state_directory"])}


def send_email(config, status, archive, service, now):
    message = EmailMessage()
    message["From"] = "no-reply@auth.arturican.com"
    message["To"] = config["recipient"]
    message["Date"] = format_datetime(now)
    message["Subject"] = ("Дневник здоровья: резервирование восстановлено" if status == "healthy"
                          else "Дневник здоровья: ошибка резервирования")
    message.set_content("Проверка резервных копий.\n"
                        f"Состояние: {status}\nАрхив: {archive['status']}\nСервис: {service['status']}\n"
                        "Проверьте состояние на обоих VPS по инструкции BACKUPS.\n")
    with smtplib.SMTP("127.0.0.1", config["smtp_port"], timeout=10) as smtp:
        if smtp.send_message(message):
            raise ValueError("SMTP rejected recipient")


def read_state(path):
    try:
        value = private_json(path, 256)
    except FileNotFoundError:
        return None
    if (not isinstance(value, dict) or set(value) != {"status", "recipient_hash"}
            or value["status"] not in ("healthy", "unhealthy")
            or not isinstance(value["recipient_hash"], str)
            or not re.fullmatch(r"[a-f0-9]{64}", value["recipient_hash"])):
        raise ValueError("Invalid state")
    return value


def write_state(path, value):
    descriptor, temporary = tempfile.mkstemp(prefix=".monitor-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as target:
            json.dump(value, target)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(temporary).unlink(missing_ok=True)


def monitor(config, send=False, now=None):
    # Read under the same lock as delivery/state update, so concurrent runs cannot
    # deliver an older observation after a more recent transition.
    def evaluate():
        archive = archive_status(config["directory"], config["max_age_hours"], now or datetime.now(timezone.utc))
        service = service_status()
        healthy = archive["status"] == "fresh" and service["status"] == "success"
        pending = archive["status"] == "fresh" and service["status"] == "running"
        return {"status": "pending" if pending else "healthy" if healthy else "unhealthy",
                "archive": archive, "service": service, "notification": "disabled"}

    if not send:
        return evaluate()
    directory = config["state_directory"]
    details = directory.stat()
    if (directory.resolve() != directory or not stat.S_ISDIR(details.st_mode)
            or details.st_mode & 0o077 or details.st_uid != os.geteuid()):
        raise ValueError("Invalid state directory")
    descriptor = os.open(directory / ".monitor.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as lock:
        if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode):
            raise ValueError("Invalid state lock")
        fcntl.flock(lock, fcntl.LOCK_EX)
        report = evaluate()
        if report["status"] == "pending":
            report["notification"] = "pending"
            return report
        path = directory / "state.json"
        previous = read_state(path)
        current = {"status": report["status"],
                   "recipient_hash": hashlib.sha256(config["recipient"].encode()).hexdigest()}
        if previous == current:
            report["notification"] = "unchanged"
            return report
        initial = previous is None or previous["recipient_hash"] != current["recipient_hash"]
        if report["status"] == "unhealthy" or not initial:
            send_email(config, report["status"], report["archive"], report["service"], now or datetime.now(timezone.utc))
            report["notification"] = "sent"
        else:
            report["notification"] = "initial_healthy"
        write_state(path, current)
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
        return 1 if report["status"] == "unhealthy" else 0
    except Exception:
        sys.stderr.write("Backup monitor failed; inspect private configuration, state and local SMTP\n")
        return 2


if __name__ == "__main__":
    os.umask(0o077)
    signal.signal(signal.SIGALRM, timed_out)
    signal.alarm(45)
    raise SystemExit(main())
