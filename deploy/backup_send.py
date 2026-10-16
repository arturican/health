#!/usr/bin/env python3
"""Root-only scheduled PostgreSQL backup. Plaintext exists only in pipes."""
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
from backup_receive import LIMIT, RESERVE, NAME, digest, prune, timed_out


def encrypted_snapshot(commands, directory, name, limit=LIMIT, reserve=RESERVE):
    if not NAME.fullmatch(name):
        raise ValueError("Invalid backup filename")
    fd, temporary = tempfile.mkstemp(prefix=".encrypt-", dir=directory)
    temporary = Path(temporary)
    processes = []
    try:
        with os.fdopen(fd, "wb") as output:
            previous = None
            for command in commands:
                process = subprocess.Popen(command, stdin=previous or subprocess.DEVNULL,
                                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                processes.append(process)
                if previous:
                    previous.close()
                previous = process.stdout
            if previous is None:
                raise ValueError("Empty pipeline")
            total = 0
            with previous:
                while chunk := previous.read(1024 * 1024):
                    total += len(chunk)
                    if total > limit or shutil.disk_usage(directory).free - len(chunk) < reserve:
                        raise ValueError("Backup storage limit")
                    output.write(chunk)
            codes = [process.wait(timeout=30) for process in processes]
            if not total or any(codes):
                raise ValueError("Backup pipeline failed")
            output.flush()
            os.fsync(output.fileno())
        target = directory / name
        os.link(temporary, target)
        temporary.unlink()
        directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        return target
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
            process.wait()
            if process.stdout:
                process.stdout.close()
        temporary.unlink(missing_ok=True)


def transfer(config, path):
    checksum = digest(path)
    command = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
               "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15",
               "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3",
               "-o", "UserKnownHostsFile=" + config["known_hosts"],
               "-i", config["ssh_key"], config["destination"], path.name + " " + checksum]
    with path.open("rb") as source:
        result = subprocess.run(command, stdin=source, capture_output=True, timeout=650, check=False)
    if result.returncode != 0 or result.stdout.strip() != checksum.encode():
        raise ValueError("Offsite transfer failed; encrypted local backup retained")


def backup(config, cluster=False, retry=None):
    directory = Path(config["directory"])
    if not directory.is_absolute() or directory.resolve() != directory or not directory.is_dir():
        raise ValueError("Invalid local backup directory")
    lock_fd = os.open(directory / ".send.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, "wb") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if retry is not None:
            if not NAME.fullmatch(retry):
                raise ValueError("Invalid retry filename")
            path = directory / retry
            if path.is_symlink() or not path.is_file():
                raise ValueError("Invalid retry file")
        else:
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + secrets.token_hex(4)
            commands = [["docker", "exec", config["container"]]]
            if cluster:
                commands[0] += ["pg_dumpall", "-U", "postgres"]
                commands.append(["gzip", "-c"])
                name = "health-cluster-" + stamp + ".sql.gz.gpg"
            else:
                commands[0] += ["pg_dump", "-U", "postgres", "-Fc", "--dbname", config["database"]]
                name = "health-diary-" + stamp + ".dump.gpg"
            commands.append(["gpg", "--homedir", config["gpg_home"], "--batch", "--trust-model", "always",
                             "--recipient", config["recipient"], "--compress-algo", "none", "--encrypt"])
            path = encrypted_snapshot(commands, directory, name)
        transfer(config, path)
        prune(directory, 7)
        return path.name


if __name__ == "__main__":
    os.umask(0o077)
    signal.signal(signal.SIGALRM, timed_out)
    signal.alarm(1200)
    try:
        arguments = sys.argv[1:]
        if arguments not in ([], ["--cluster"]) and not (len(arguments) == 2 and arguments[0] == "--retry"):
            raise ValueError("Invalid arguments")
        config = json.loads(Path("/etc/health-diary/backup.json").read_text())
        print(backup(config, cluster=arguments == ["--cluster"],
                     retry=arguments[1] if len(arguments) == 2 else None))
    except Exception:
        sys.stderr.write("Encrypted backup failed; inspect service/configuration; retained copies are unchanged\n")
        sys.exit(1)
