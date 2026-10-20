from contextlib import redirect_stdout, redirect_stderr
from datetime import datetime, timedelta, timezone
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from backup_check import archive_status, service_status, main

NOW = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
NAME = "health-diary-20261020T120000Z-1234abcd.dump.gpg"
SUCCESS = ("LoadState=loaded\nActiveState=inactive\nResult=success\n"
           "ExecMainStatus=0\nExecMainStartTimestampMonotonic=123456\n")


class BackupCheckTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name).resolve()

    def tearDown(self):
        self.temporary.cleanup()

    def archive(self, name=NAME):
        path = self.directory / name
        path.write_bytes(b"synthetic ciphertext")
        return path

    def test_fresh_boundary_stale_and_future_ignore_mtime(self):
        os.utime(self.archive(), (0, 0))
        for elapsed, expected in [(0, "fresh"), (3600, "fresh"),
                                  (3601, "stale"), (-1, "future_archive")]:
            with self.subTest(elapsed=elapsed):
                report = archive_status(self.directory, 1, NOW + timedelta(seconds=elapsed))
                self.assertEqual(report["status"], expected)
                if elapsed >= 0:
                    self.assertEqual(report["age_seconds"], elapsed)

    def test_missing_and_baseline_are_not_zero_age(self):
        self.assertEqual(archive_status(self.directory, 1, NOW), {"status": "missing"})
        self.archive("health-cluster-20261020T120000Z-1234abcd.sql.gz.gpg")
        self.assertEqual(archive_status(self.directory, 1, NOW), {"status": "missing"})

    def test_invalid_latest_does_not_fall_back_to_older_archive(self):
        self.archive(NAME.replace("120000", "110000"))
        latest = self.directory / NAME
        for kind in ("empty", "directory", "symlink"):
            with self.subTest(kind=kind):
                if kind == "empty":
                    latest.touch()
                elif kind == "directory":
                    latest.mkdir()
                else:
                    latest.symlink_to(self.directory / "missing-target")
                self.assertEqual(archive_status(self.directory, 2, NOW),
                                 {"status": "invalid_archive"})
                if kind == "directory":
                    latest.rmdir()
                else:
                    latest.unlink()
        self.archive(NAME.replace("20261020", "20261320"))
        self.assertEqual(archive_status(self.directory, 2, NOW), {"status": "invalid_archive"})

    def test_directory_and_age_errors(self):
        self.assertEqual(archive_status(Path("relative"), 1, NOW), {"status": "invalid_directory"})
        self.assertEqual(archive_status(self.directory / "absent", 1, NOW), {"status": "unavailable"})
        alias = self.directory / "alias"
        alias.symlink_to(self.directory, target_is_directory=True)
        self.assertEqual(archive_status(alias, 1, NOW), {"status": "invalid_directory"})
        with patch.object(Path, "iterdir", side_effect=PermissionError):
            self.assertEqual(archive_status(self.directory, 1, NOW), {"status": "unavailable"})
        loop = self.directory / "loop"
        loop.symlink_to(loop)
        self.assertEqual(archive_status(loop, 1, NOW), {"status": "unavailable"})
        for age in (0, -1, float("inf"), float("nan")):
            with self.subTest(age=age), self.assertRaises(ValueError):
                archive_status(self.directory, age, NOW)

    def test_systemd_success_and_failure_states(self):
        cases = [(SUCCESS, "success"),
                 (SUCCESS.replace("Result=success", "Result=exit-code"), "failed"),
                 (SUCCESS.replace("ExecMainStatus=0", "ExecMainStatus=1"), "failed"),
                 (SUCCESS.replace("ActiveState=inactive", "ActiveState=failed"), "failed"),
                 (SUCCESS.replace("ActiveState=inactive", "ActiveState=activating"), "running"),
                 (SUCCESS.replace("123456", "0"), "not_run"),
                 (SUCCESS.replace("LoadState=loaded", "LoadState=not-found"), "unavailable"),
                 ("", "unavailable"), ("malformed", "unavailable"),
                 (SUCCESS.replace("123456", "bad"), "unavailable")]
        for output, expected in cases:
            with self.subTest(output=output), patch("backup_check.subprocess.run") as run:
                run.return_value = subprocess.CompletedProcess([], 0, output, "")
                self.assertEqual(service_status(), {"status": expected})
                self.assertEqual(run.call_args.args[0][:3],
                                 ["systemctl", "show", "health-backup.service"])
                self.assertEqual(run.call_args.kwargs["timeout"], 10)

    def test_systemd_errors_are_unavailable(self):
        for error in (FileNotFoundError(), PermissionError(), subprocess.TimeoutExpired("systemctl", 10)):
            with self.subTest(error=error), patch("backup_check.subprocess.run", side_effect=error):
                self.assertEqual(service_status(), {"status": "unavailable"})
        with patch("backup_check.subprocess.run") as run:
            run.return_value = subprocess.CompletedProcess([], 1, SUCCESS, "synthetic private detail")
            self.assertEqual(service_status(), {"status": "unavailable"})

    def test_cli_json_and_exit_codes_without_disclosing_paths_or_errors(self):
        self.archive()
        for service, expected in [("success", 0), ("failed", 1), ("running", 1), ("unavailable", 1)]:
            output = io.StringIO()
            with patch("backup_check.datetime") as clock, patch("backup_check.service_status") as check:
                clock.now.return_value = NOW
                clock.strptime = datetime.strptime
                check.return_value = {"status": service}
                with redirect_stdout(output):
                    code = main(["--directory", str(self.directory), "--max-age-hours", "1"])
            report = json.loads(output.getvalue())
            self.assertEqual(code, expected)
            self.assertEqual(report["healthy"], expected == 0)
            self.assertEqual(report["archive"]["status"], "fresh")
            self.assertNotIn(str(self.directory), output.getvalue())
            self.assertNotIn(NAME, output.getvalue())
        for age in ("nan", "inf", "-1", "0", "invalid"):
            with self.subTest(age=age), redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
                main(["--directory", str(self.directory), "--max-age-hours", age])
            self.assertEqual(caught.exception.code, 2)

    def test_cli_successful_service_cannot_hide_missing_or_stale_archive(self):
        for present, when, expected in [(False, NOW, "missing"),
                                        (True, NOW + timedelta(hours=2), "stale"),
                                        (True, NOW - timedelta(seconds=1), "future_archive")]:
            if present and not (self.directory / NAME).exists():
                self.archive()
            before = {path.name: path.read_bytes() for path in self.directory.iterdir()}
            output = io.StringIO()
            with patch("backup_check.datetime") as clock, patch("backup_check.service_status") as check:
                clock.now.return_value = when
                clock.strptime = datetime.strptime
                check.return_value = {"status": "success"}
                with redirect_stdout(output):
                    self.assertEqual(main(["--directory", str(self.directory), "--max-age-hours", "1"]), 1)
            self.assertEqual(json.loads(output.getvalue())["archive"]["status"], expected)
            self.assertEqual({path.name: path.read_bytes() for path in self.directory.iterdir()}, before)


if __name__ == "__main__":
    unittest.main()
