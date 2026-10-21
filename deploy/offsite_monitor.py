#!/usr/bin/env python3
"""Independent offsite notification artifact; --send enables state and email."""
import argparse
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import format_datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import smtplib
import stat
import subprocess
import sys
from backup_monitor import private_json, read_state, validate_config, write_state
from watchdog_probe import deadline


def check(config):
    unknown = {"status":"unhealthy","freshness":"unknown","integrity":"unknown",
               "verified":0,"unattested":0,"failed":0}
    try:
        result = subprocess.run([sys.executable,"-B",str(Path(__file__).with_name("offsite_check.py")),
                                 "--directory",str(config["directory"]),
                                 "--max-age-hours",str(config["max_age_hours"])],
                                stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=65,check=False)
        if len(result.stdout) > 1024:
            return unknown
        report = json.loads(result.stdout)
        if (type(report) is not dict or set(report) != set(unknown)
                or report["status"] not in ("healthy","unhealthy")
                or report["freshness"] not in ("fresh","stale","missing","invalid_directory",
                                               "invalid_archive","future_archive","unavailable")
                or report["integrity"] not in ("unavailable","busy","invalid_inventory",
                                              "failed","unattested","verified")
                or any(type(report[key]) is not int or not 0 <= report[key] <= 14
                       for key in ("verified","unattested","failed"))
                or sum(report[key] for key in ("verified","unattested","failed")) > 14
                or (report["status"] == "healthy") !=
                   (report["freshness"] == "fresh" and report["integrity"] == "verified"
                    and report["verified"] > 0 and report["unattested"] == report["failed"] == 0)
                or result.returncode != (0 if report["status"] == "healthy" else 1)):
            return unknown
        return report
    except (OSError,subprocess.TimeoutExpired,ValueError,UnicodeError):
        return unknown


def notify(config, report):
    message = EmailMessage()
    message["From"] = "no-reply@auth.arturican.com"
    message["To"] = config["recipient"]
    message["Date"] = format_datetime(datetime.now(timezone.utc))
    message["Subject"] = ("Дневник здоровья: внешние копии восстановлены" if report["status"] == "healthy"
                          else "Дневник здоровья: ошибка внешних копий")
    message.set_content("Проверка внешних зашифрованных копий.\n"
                        f"Состояние: {report['status']}\nСвежесть: {report['freshness']}\n"
                        f"Целостность: {report['integrity']}\n"
                        "Проверьте оба VPS по инструкции BACKUPS. Данные не расшифровывались.\n")
    with smtplib.SMTP("127.0.0.1",config["smtp_port"],timeout=10) as smtp:
        if smtp.send_message(message):
            raise ValueError("SMTP rejected recipient")


def monitor(config, send=False):
    if not send:
        return {**check(config),"notification":"disabled"}
    directory = config["state_directory"]
    details = directory.stat()
    if (directory.resolve() != directory or not stat.S_ISDIR(details.st_mode)
            or details.st_mode & 0o077 or details.st_uid != os.geteuid()):
        raise ValueError("Invalid state directory")
    descriptor = os.open(directory/".offsite.lock",os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW,0o600)
    with os.fdopen(descriptor,"wb") as lock:
        info = os.fstat(lock.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.geteuid():
            raise ValueError("Invalid state lock")
        fcntl.flock(lock,fcntl.LOCK_EX)
        path = directory/"offsite.json"
        previous = read_state(path)
        report = check(config)
        current = {"status":report["status"],
                   "recipient_hash":hashlib.sha256(config["recipient"].encode()).hexdigest()}
        if previous == current:
            return {**report,"notification":"unchanged"}
        initial = previous is None or previous["recipient_hash"] != current["recipient_hash"]
        notification = "initial_healthy"
        if current["status"] == "unhealthy" or not initial:
            notify(config,report)
            notification = "sent"
        write_state(path,current)
        return {**report,"notification":notification}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config",type=Path,required=True)
    parser.add_argument("--send",action="store_true")
    args = parser.parse_args(argv)
    try:
        config = validate_config(private_json(args.config,8192))
        report = monitor(config,args.send)
        print(json.dumps(report))
        return 0 if report["status"] == "healthy" else 1
    except Exception:
        sys.stderr.write("Offsite monitor failed; inspect private config/state and independent SMTP\n")
        return 2


if __name__ == "__main__":
    os.umask(0o077)
    signal.signal(signal.SIGALRM,deadline)
    signal.alarm(80)
    raise SystemExit(main())
