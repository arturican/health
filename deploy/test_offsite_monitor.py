from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stdout, redirect_stderr
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import smtplib
import subprocess
import tempfile
from threading import Barrier
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from backup_monitor import validate_config
from offsite_check import check as check_archives
import offsite_monitor
from offsite_monitor import check as run_check, notify as send_notification
from watchdog_probe import DeadlineExceeded

HEALTHY = {"status":"healthy","freshness":"fresh","integrity":"verified","verified":1,"unattested":0,"failed":0}
FAILED = {**HEALTHY,"status":"unhealthy","integrity":"failed","verified":0,"failed":1}


class OffsiteMonitorTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.state = self.root / "state"
        self.state.mkdir(mode=0o700)
        self.config = validate_config({"directory":str(self.root),"state_directory":str(self.state),
                                       "max_age_hours":30,"recipient":"operator@example.test","smtp_port":25})
        self.observe = patch("offsite_monitor.check",return_value=HEALTHY.copy()).start()
        self.send = patch("offsite_monitor.notify").start()
        self.addCleanup(patch.stopall)

    def run_monitor(self):
        return offsite_monitor.monitor(self.config,True)

    def test_initial_silence_dedup_error_changes_recovery_and_recipient(self):
        self.assertEqual(self.run_monitor()["notification"],"initial_healthy")
        self.observe.return_value = FAILED.copy()
        self.assertEqual(self.run_monitor()["notification"],"sent")
        self.assertEqual(self.run_monitor()["notification"],"unchanged")
        self.observe.return_value = {**FAILED,"integrity":"unattested","failed":0,"unattested":1}
        self.assertEqual(self.run_monitor()["notification"],"unchanged")
        self.config["recipient"] = "second@example.test"
        self.assertEqual(self.run_monitor()["notification"],"sent")
        self.observe.return_value = HEALTHY.copy()
        self.assertEqual(self.run_monitor()["notification"],"sent")
        self.assertEqual(self.run_monitor()["notification"],"unchanged")
        self.assertEqual(self.send.call_count,3)

    def test_dry_run_does_not_create_state_lock_or_send(self):
        self.assertEqual(offsite_monitor.monitor(self.config)["notification"],"disabled")
        self.assertEqual(list(self.state.iterdir()),[])
        self.send.assert_not_called()

    def test_failed_smtp_does_not_ack_or_replace_previous_state(self):
        self.observe.return_value = FAILED.copy()
        self.send.side_effect = smtplib.SMTPException("private synthetic error")
        with self.assertRaises(smtplib.SMTPException):
            self.run_monitor()
        path = self.state / "offsite.json"
        self.assertFalse(path.exists())
        self.send.side_effect = None
        self.run_monitor()
        before = path.read_bytes()
        self.observe.return_value = HEALTHY.copy()
        self.send.side_effect = OSError("private synthetic error")
        with self.assertRaises(OSError):
            self.run_monitor()
        self.assertEqual(path.read_bytes(),before)
        self.send.side_effect = None
        self.assertEqual(self.run_monitor()["notification"],"sent")

    def test_concurrent_observations_send_once(self):
        self.observe.return_value = FAILED.copy()
        barrier = Barrier(6)
        def run(_):
            barrier.wait(timeout=5)
            return self.run_monitor()
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(run,range(6)))
        self.assertEqual(sum(report["notification"]=="sent" for report in results),1)
        self.send.assert_called_once()

    def test_private_corrupt_symlink_state_and_lock(self):
        self.run_monitor()
        path = self.state / "offsite.json"
        self.assertEqual(path.stat().st_mode & 0o777,0o600)
        self.assertNotIn(self.config["recipient"],path.read_text())
        self.assertFalse((self.state/"state.json").exists())
        self.assertFalse((self.state/"watchdog.json").exists())
        path.write_text("{}")
        with self.assertRaises(ValueError):
            self.run_monitor()
        path.unlink()
        path.symlink_to(self.root/"absent")
        with self.assertRaises(OSError):
            self.run_monitor()
        path.unlink()
        self.run_monitor()
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            self.run_monitor()
        path.chmod(0o600)
        lock = self.state/".offsite.lock"
        lock.chmod(0o644)
        with self.assertRaises(ValueError):
            self.run_monitor()
        lock.unlink()
        lock.symlink_to(self.root/"absent-lock")
        with self.assertRaises(OSError):
            self.run_monitor()
        lock.unlink()
        self.state.chmod(0o755)
        with self.assertRaises(ValueError):
            self.run_monitor()

    def test_actual_synthetic_missing_corrupt_and_repaired_inventory(self):
        now = datetime(2026,10,21,10,tzinfo=timezone.utc)
        (self.root/".receive.lock").touch(mode=0o600)
        name = "health-diary-20261021T090000Z-1234abcd.dump.gpg"
        self.observe.return_value = check_archives(self.root,30,now)
        self.assertEqual(self.run_monitor()["freshness"],"missing")
        archive = self.root/name
        archive.write_bytes(b"synthetic ciphertext")
        archive.chmod(0o600)
        manifest = self.root/(name+".sha256")
        manifest.write_text("0"*64+"\n")
        manifest.chmod(0o600)
        self.observe.return_value = check_archives(self.root,30,now)
        self.assertEqual(self.run_monitor()["integrity"],"failed")
        self.assertEqual(self.send.call_count,1)
        manifest.write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+"\n")
        self.observe.return_value = check_archives(self.root,30,now)
        self.assertEqual(self.run_monitor()["notification"],"sent")
        self.assertEqual(self.send.call_count,2)

    def test_stale_busy_and_unknown_are_never_healthy(self):
        for changes in ({"freshness":"stale"}, {"integrity":"busy"}, {"freshness":"unknown","integrity":"unknown"}):
            with self.subTest(changes=changes):
                self.observe.return_value = {**FAILED,**changes}
                self.assertEqual(self.run_monitor()["status"],"unhealthy")

    def test_mail_payload_loopback_and_refusal(self):
        with patch("offsite_monitor.smtplib.SMTP") as factory:
            client = factory.return_value.__enter__.return_value
            client.send_message.return_value = {}
            send_notification(self.config,FAILED)
            factory.assert_called_once_with("127.0.0.1",25,timeout=10)
            message = client.send_message.call_args.args[0]
            body = message.get_content()
            self.assertIn("unhealthy",body)
            self.assertIn("failed",body)
            for private in (str(self.root),self.config["recipient"],"1234abcd"):
                self.assertNotIn(private,body)
            client.send_message.return_value = {"operator@example.test":(550,"private")}
            with self.assertRaises(ValueError):
                send_notification(self.config,HEALTHY)

    def test_child_probe_schema_timeout_and_fixed_command(self):
        with patch("offsite_monitor.subprocess.run") as run:
            run.return_value = SimpleNamespace(stdout=json.dumps(HEALTHY).encode(),returncode=0)
            self.assertEqual(run_check(self.config),HEALTHY)
            command = run.call_args.args[0]
            self.assertTrue(command[2].endswith("/offsite_check.py"))
            self.assertEqual(command[3:],["--directory",str(self.root),"--max-age-hours","30"])
            self.assertEqual(run.call_args.kwargs["timeout"],65)
            invalid = [b"x"*1025,b"invalid",b"{}",json.dumps({**HEALTHY,"verified":True}).encode(),
                       json.dumps({**HEALTHY,"verified":15}).encode(),
                       json.dumps({**HEALTHY,"freshness":"untrusted private"}).encode(),
                       json.dumps({**HEALTHY,"failed":1}).encode()]
            for raw in invalid:
                run.return_value = SimpleNamespace(stdout=raw,returncode=0)
                self.assertEqual(run_check(self.config)["integrity"],"unknown")
            run.return_value = SimpleNamespace(stdout=json.dumps(HEALTHY).encode(),returncode=1)
            self.assertEqual(run_check(self.config)["status"],"unhealthy")
            run.side_effect = subprocess.TimeoutExpired(command,65)
            self.assertEqual(run_check(self.config)["freshness"],"unknown")

    def test_cli_redacts_config_and_smtp_errors(self):
        config = self.root/"config.json"
        config.write_text(json.dumps({**self.config,"directory":str(self.root),"state_directory":str(self.state)}))
        config.chmod(0o600)
        self.observe.return_value = FAILED.copy()
        self.send.side_effect = OSError("operator@example.test private error")
        out,err = io.StringIO(),io.StringIO()
        with redirect_stdout(out),redirect_stderr(err):
            self.assertEqual(offsite_monitor.main(["--config",str(config),"--send"]),2)
        self.assertEqual(out.getvalue(),"")
        self.assertNotIn("operator@example.test",err.getvalue())
        self.assertNotIn(str(self.root),err.getvalue())
        self.assertFalse((self.state/"offsite.json").exists())

    def test_parent_deadline_does_not_become_a_deliverable_observation(self):
        with patch("offsite_monitor.subprocess.run",side_effect=DeadlineExceeded):
            with self.assertRaises(DeadlineExceeded):
                run_check(self.config)
        self.observe.side_effect = DeadlineExceeded
        config = self.root/"deadline-config.json"
        config.write_text(json.dumps({**self.config,"directory":str(self.root),"state_directory":str(self.state)}))
        config.chmod(0o600)
        output,error = io.StringIO(),io.StringIO()
        with redirect_stdout(output),redirect_stderr(error):
            self.assertEqual(offsite_monitor.main(["--config",str(config),"--send"]),2)
        self.assertEqual(output.getvalue(),"")
        self.assertFalse((self.state/"offsite.json").exists())
        self.send.assert_not_called()
