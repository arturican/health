from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stdout, redirect_stderr
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
import io
import json
from pathlib import Path
import smtplib
import tempfile
from threading import Barrier
import unittest
from unittest.mock import patch
from backup_monitor import main, monitor, private_json, send_email, validate_config

NOW = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.state = self.root / "state"
        self.state.mkdir(mode=0o700)
        self.config = validate_config({"directory": str(self.root), "state_directory": str(self.state),
                                       "max_age_hours": 30, "recipient": "operator@example.test", "smtp_port": 25})
        self.archive = patch("backup_monitor.archive_status", return_value={"status": "fresh", "age_seconds": 0}).start()
        self.service = patch("backup_monitor.service_status", return_value={"status": "success"}).start()
        self.send = patch("backup_monitor.send_email").start()
        self.addCleanup(patch.stopall)
        self.addCleanup(self.temporary.cleanup)

    def run_monitor(self, send=True):
        return monitor(self.config, send=send, now=NOW)

    def test_initial_success_alert_deduplication_and_recovery(self):
        self.assertEqual(self.run_monitor()["notification"], "initial_healthy")
        self.send.assert_not_called()
        self.service.return_value = {"status": "failed"}
        self.assertEqual(self.run_monitor()["notification"], "sent")
        self.assertEqual(self.send.call_args.args[1], "unhealthy")
        self.assertEqual(self.run_monitor()["notification"], "unchanged")
        self.service.return_value = {"status": "success"}
        self.assertEqual(self.run_monitor()["notification"], "sent")
        self.assertEqual(self.send.call_args.args[1], "healthy")
        self.assertEqual(self.run_monitor()["notification"], "unchanged")
        self.assertEqual(self.send.call_count, 2)
        state = self.state / "state.json"
        self.assertEqual(state.stat().st_mode & 0o777, 0o600)
        self.assertNotIn(self.config["recipient"], state.read_text())
        self.assertFalse(list(self.state.glob(".monitor-*")))

    def test_initial_failure_changed_recipient_and_smtp_retry(self):
        self.service.return_value = {"status": "unavailable"}
        self.send.side_effect = smtplib.SMTPException("synthetic private SMTP detail")
        with self.assertRaises(smtplib.SMTPException):
            self.run_monitor()
        self.assertFalse((self.state / "state.json").exists())
        self.send.side_effect = None
        self.assertEqual(self.run_monitor()["notification"], "sent")
        self.config["recipient"] = "new-operator@example.test"
        self.assertEqual(self.run_monitor()["notification"], "sent")
        self.assertEqual(self.run_monitor()["notification"], "unchanged")
        self.assertEqual(self.send.call_count, 3)

    def test_dry_run_and_pending_do_not_send_or_write(self):
        self.service.return_value = {"status": "failed"}
        self.assertEqual(self.run_monitor(send=False)["status"], "unhealthy")
        self.assertEqual(list(self.state.iterdir()), [])
        self.service.return_value = {"status": "running"}
        self.assertEqual(self.run_monitor()["status"], "pending")
        self.assertFalse((self.state / "state.json").exists())
        self.archive.return_value = {"status": "stale", "age_seconds": 200000}
        self.assertEqual(self.run_monitor()["status"], "unhealthy")
        self.send.assert_called_once()

    def test_concurrent_checks_send_one_alert(self):
        self.service.return_value = {"status": "failed"}
        barrier = Barrier(6)
        def concurrent_check(_):
            barrier.wait(timeout=5)
            return self.run_monitor()
        with ThreadPoolExecutor(max_workers=6) as workers:
            reports = list(workers.map(concurrent_check, range(6)))
        self.assertEqual(sum(report["notification"] == "sent" for report in reports), 1)
        self.send.assert_called_once()

    def test_failed_recovery_delivery_preserves_unhealthy_state(self):
        self.service.return_value = {"status": "failed"}
        self.run_monitor()
        state = self.state / "state.json"
        before = state.read_bytes()
        self.service.return_value = {"status": "success"}
        self.send.side_effect = smtplib.SMTPException("synthetic failure")
        with self.assertRaises(smtplib.SMTPException):
            self.run_monitor()
        self.assertEqual(state.read_bytes(), before)
        self.send.side_effect = None
        self.assertEqual(self.run_monitor()["notification"], "sent")

    def test_failed_atomic_replace_keeps_previous_state_and_cleans_temporary_file(self):
        self.run_monitor()
        state = self.state / "state.json"
        before = state.read_bytes()
        self.service.return_value = {"status": "failed"}
        with patch("backup_monitor.os.replace", side_effect=OSError("synthetic storage failure")):
            with self.assertRaises(OSError):
                self.run_monitor()
        self.assertEqual(state.read_bytes(), before)
        self.assertFalse(list(self.state.glob(".monitor-*")))
        self.assertEqual(self.run_monitor()["notification"], "sent")

    def test_corrupted_symlink_and_public_state_are_rejected(self):
        state = self.state / "state.json"
        state.write_text("not-json")
        state.chmod(0o600)
        with self.assertRaises(ValueError):
            self.run_monitor()
        state.write_text('{}')
        with self.assertRaises(ValueError):
            self.run_monitor()
        state.unlink()
        state.symlink_to(self.root / "missing")
        with self.assertRaises(OSError):
            self.run_monitor()
        state.unlink()
        self.state.chmod(0o755)
        with self.assertRaises(ValueError):
            self.run_monitor()
        self.send.assert_not_called()

    def test_invalid_external_config_and_private_file(self):
        values = {**self.config, "directory": str(self.root), "state_directory": str(self.state)}
        cases = [{**values, "unexpected": True}, {**values, "smtp_port": True},
                 {**values, "smtp_port": 65536}, {**values, "max_age_hours": 0},
                 {**values, "max_age_hours": float("nan")}, {**values, "max_age_hours": True},
                 {**values, "recipient": "a@example.test\r\nBcc:b@example.test"},
                 {**values, "recipient": "Name <a@example.test>"}, {**values, "directory": "relative"}]
        for value in cases:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_config(value)
        config_file = self.root / "config.json"
        config_file.write_text(json.dumps(values))
        config_file.chmod(0o644)
        with self.assertRaises(ValueError):
            private_json(config_file, 8192)
        config_file.chmod(0o600)
        self.assertEqual(private_json(config_file, 8192), values)
        with self.assertRaises(ValueError):
            private_json(config_file, 1)

    def test_smtp_uses_only_loopback_and_technical_message(self):
        with patch("backup_monitor.smtplib.SMTP") as smtp:
            client = smtp.return_value.__enter__.return_value
            client.send_message.return_value = {}
            send_email(self.config, "unhealthy", {"status": "stale"}, {"status": "failed"}, NOW)
            smtp.assert_called_once_with("127.0.0.1", 25, timeout=10)
            message = client.send_message.call_args.args[0]
            # Exercise MIME serialization/decoding too, including the Russian subject.
            decoded = BytesParser(policy=policy.default).parsebytes(message.as_bytes())
            self.assertEqual(decoded["To"], "operator@example.test")
            self.assertIn("ошибка резервирования", str(decoded["Subject"]))
            self.assertIn("stale", decoded.get_content())
            self.assertNotIn(str(self.root), decoded.get_content())
            client.send_message.return_value = {"operator@example.test": (550, "synthetic rejected")}
            with self.assertRaises(ValueError):
                send_email(self.config, "unhealthy", {"status": "stale"}, {"status": "failed"}, NOW)

    def test_cli_exit_codes_and_redacted_errors(self):
        values = {**self.config, "directory": str(self.root), "state_directory": str(self.state)}
        config_file = self.root / "config.json"
        config_file.write_text(json.dumps(values))
        config_file.chmod(0o600)
        for service, expected in [("success", 0), ("failed", 1), ("running", 0)]:
            self.service.return_value = {"status": service}
            output = io.StringIO()
            with redirect_stdout(output):
                self.assertEqual(main(["--config", str(config_file)]), expected)
            self.assertNotIn(self.config["recipient"], output.getvalue())
            self.assertEqual(json.loads(output.getvalue())["notification"], "disabled")
        self.send.side_effect = smtplib.SMTPException("synthetic-secret@example.test")
        self.service.return_value = {"status": "failed"}
        output = io.StringIO()
        with redirect_stderr(output):
            self.assertEqual(main(["--config", str(config_file), "--send"]), 2)
        self.assertNotIn("synthetic-secret", output.getvalue())


if __name__ == "__main__":
    unittest.main()
