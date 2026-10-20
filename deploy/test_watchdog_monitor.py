from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stdout, redirect_stderr
from email import policy
from email.parser import BytesParser
import io
import json
from pathlib import Path
import smtplib
import subprocess
from types import SimpleNamespace
import tempfile
from threading import Barrier
import unittest
from unittest.mock import patch
from backup_monitor import validate_config
from watchdog_monitor import main, monitor, notify, read_state, DeadlineExceeded, check

HEALTHY = {"version": 1, "status": "healthy", "health": "ok", "readiness": "ready"}
UNHEALTHY = {"version": 1, "status": "unhealthy", "health": "unavailable", "readiness": "unavailable"}


class WatchdogTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.state = self.root / "state"
        self.state.mkdir(mode=0o700)
        self.config = validate_config({"directory": str(self.root), "state_directory": str(self.state),
                                       "max_age_hours": 30, "recipient": "operator@example.test", "smtp_port": 25})
        self.check = patch("watchdog_monitor.check", return_value=HEALTHY.copy()).start()
        self.send = patch("watchdog_monitor.notify").start()
        self.addCleanup(patch.stopall)

    def run_monitor(self):
        return monitor(self.config, True)

    def test_two_observations_flapping_deduplication_and_recovery(self):
        self.assertEqual(self.run_monitor()["notification"], "pending")
        self.assertEqual(self.run_monitor()["notification"], "initial_healthy")
        self.check.return_value = UNHEALTHY.copy()
        self.assertEqual(self.run_monitor()["notification"], "pending")
        self.check.return_value = HEALTHY.copy()
        self.assertEqual(self.run_monitor()["notification"], "pending")
        self.check.return_value = UNHEALTHY.copy()
        self.run_monitor()
        self.assertEqual(self.run_monitor()["notification"], "sent")
        self.assertEqual(self.send.call_args.args[1], "unhealthy")
        self.assertEqual(self.run_monitor()["notification"], "unchanged")
        self.check.return_value = HEALTHY.copy()
        self.assertEqual(self.run_monitor()["notification"], "pending")
        self.assertEqual(self.run_monitor()["notification"], "sent")
        self.assertEqual(self.send.call_args.args[1], "healthy")
        self.assertEqual(self.send.call_count, 2)

    def test_initial_failure_smtp_failure_retries_without_ack(self):
        self.check.return_value = UNHEALTHY.copy()
        self.run_monitor()
        before = (self.state / "watchdog.json").read_bytes()
        self.send.side_effect = smtplib.SMTPException("private")
        with self.assertRaises(smtplib.SMTPException):
            self.run_monitor()
        self.assertEqual((self.state / "watchdog.json").read_bytes(), before)
        self.send.side_effect = None
        self.assertEqual(self.run_monitor()["notification"], "sent")
        self.config["recipient"] = "new@example.test"
        self.assertEqual(self.run_monitor()["notification"], "pending")
        self.assertEqual(self.run_monitor()["notification"], "sent")

    def test_dry_run_writes_and_sends_nothing(self):
        self.assertEqual(monitor(self.config)["notification"], "disabled")
        self.assertEqual(list(self.state.iterdir()), [])
        self.send.assert_not_called()

    def test_concurrent_runs_send_once(self):
        self.check.return_value = UNHEALTHY.copy()
        barrier = Barrier(6)
        def concurrent(_):
            barrier.wait(timeout=5)
            return self.run_monitor()
        with ThreadPoolExecutor(max_workers=6) as pool:
            reports = list(pool.map(concurrent, range(6)))
        self.assertEqual(sum(report["notification"] == "sent" for report in reports), 1)
        self.send.assert_called_once()

    def test_private_state_and_corruption_fail_closed(self):
        self.run_monitor()
        path = self.state / "watchdog.json"
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertNotIn(self.config["recipient"], path.read_text())
        for value in [{}, {"candidate": "healthy", "count": True, "notified": None, "recipient_hash": "a"*64}]:
            path.write_text(json.dumps(value))
            with self.assertRaises(ValueError):
                self.run_monitor()
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            read_state(path, "a"*64)
        path.unlink()
        path.symlink_to(self.root / "absent")
        with self.assertRaises(OSError):
            self.run_monitor()
        path.unlink()
        self.state.chmod(0o755)
        with self.assertRaises(ValueError):
            self.run_monitor()

    def test_mail_loopback_fixed_technical_payload_and_refusal(self):
        with patch("watchdog_monitor.smtplib.SMTP") as factory:
            client = factory.return_value.__enter__.return_value
            client.send_message.return_value = {}
            notify(self.config, "unhealthy")
            factory.assert_called_with("127.0.0.1", 25, timeout=10)
            message = BytesParser(policy=policy.default).parsebytes(client.send_message.call_args.args[0].as_bytes())
            self.assertIn("API недоступен", str(message["Subject"]))
            self.assertNotIn(str(self.root), message.get_content())
            self.assertNotIn(self.config["recipient"], message.get_content())
            client.send_message.return_value = {"operator@example.test": (550, "private")}
            with self.assertRaises(ValueError):
                notify(self.config, "unhealthy")

    def test_cli_redacts_config_state_and_deadline_errors(self):
        config = self.root / "config.json"
        config.write_text(json.dumps({**self.config, "directory": str(self.root), "state_directory": str(self.state)}))
        config.chmod(0o600)
        self.check.side_effect = DeadlineExceeded
        output, error = io.StringIO(), io.StringIO()
        with redirect_stdout(output), redirect_stderr(error):
            self.assertEqual(main(["--config", str(config), "--send"]), 2)
        self.assertEqual(output.getvalue(), "")
        self.assertFalse((self.state / "watchdog.json").exists())
        self.send.assert_not_called()
        config.chmod(0o644)
        error = io.StringIO()
        with redirect_stderr(error):
            self.assertEqual(main(["--config", str(config)]), 2)
        self.assertNotIn(str(self.root), error.getvalue())
        self.assertNotIn(self.config["recipient"], error.getvalue())

    def test_child_probe_timeout_invalid_result_and_fixed_command(self):
        # Imported function keeps the original binding despite monitor.check being mocked.
        with patch("watchdog_monitor.subprocess.run") as run:
            run.return_value = SimpleNamespace(stdout=json.dumps(HEALTHY).encode(), returncode=0)
            self.assertEqual(check(), HEALTHY)
            command = run.call_args.args[0]
            self.assertTrue(command[-1].endswith("/watchdog_probe.py"))
            self.assertEqual(run.call_args.kwargs["timeout"], 17)
            for result in [SimpleNamespace(stdout=b"private"*200, returncode=0),
                           SimpleNamespace(stdout=b"not json", returncode=0),
                           SimpleNamespace(stdout=json.dumps(HEALTHY).encode(), returncode=1)]:
                run.return_value = result
                self.assertEqual(check()["health"], "unknown")
            run.side_effect = subprocess.TimeoutExpired(command, 17)
            self.assertEqual(check()["health"], "unknown")
            run.side_effect = DeadlineExceeded
            with self.assertRaises(DeadlineExceeded):
                check()
