from contextlib import redirect_stdout, redirect_stderr
from datetime import datetime, timezone, timedelta
import fcntl
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from backup_receive import receive, attest
from offsite_check import check, check_archive, main
from watchdog_probe import DeadlineExceeded

NOW = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
NAME = "health-diary-20261020T120000Z-1234abcd.dump.gpg"


class OffsiteTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.archive = self.root / NAME
        self.manifest = self.root / (NAME + ".sha256")

    def send(self):
        payload = b"synthetic ciphertext"
        receive(self.root, NAME + " " + hashlib.sha256(payload).hexdigest(), io.BytesIO(payload))

    def probe(self, now=NOW):
        return check(self.root, 30, now)

    def test_missing_fresh_verified_and_stale_are_distinct(self):
        self.assertEqual(self.probe()["freshness"], "missing")
        self.send()
        before = {path.name: path.read_bytes() for path in self.root.iterdir()}
        self.assertEqual(self.probe(), {"status": "healthy", "freshness": "fresh", "integrity": "verified",
                                       "verified": 1, "unattested": 0, "failed": 0})
        self.assertEqual({path.name: path.read_bytes() for path in self.root.iterdir()}, before)
        self.assertEqual(self.probe(NOW + timedelta(hours=31))["freshness"], "stale")
        self.assertEqual(self.probe(NOW + timedelta(hours=31))["status"], "unhealthy")

    def test_corrupt_unattested_invalid_manifest_never_healthy(self):
        self.send()
        self.archive.write_bytes(b"corrupted")
        self.assertEqual(check_archive(self.archive), "corrupt")
        self.assertEqual(self.probe()["failed"], 1)
        self.manifest.unlink()
        self.assertEqual(self.probe()["integrity"], "unattested")
        for value in [b"", b"x"*66, b"g"*64+b"\n", b"a"*64]:
            self.manifest.write_bytes(value)
            self.assertEqual(check_archive(self.archive), "invalid_manifest")

    def test_every_retained_archive_and_orphan_are_checked(self):
        self.send()
        other = self.root / NAME.replace("120000", "110000")
        other.write_bytes(b"old synthetic")
        self.assertEqual(self.probe()["unattested"], 1)
        attest(other, hashlib.sha256(other.read_bytes()).hexdigest())
        self.assertEqual(self.probe()["verified"], 2)
        other.unlink()
        self.assertEqual(self.probe()["integrity"], "invalid_inventory")

    def test_receive_lock_is_nonblocking_and_not_healthy(self):
        self.send()
        with (self.root / ".receive.lock").open("rb") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            self.assertEqual(self.probe()["integrity"], "busy")
            self.assertEqual(self.probe()["status"], "unhealthy")

    def test_symlink_oversize_and_public_files_are_rejected(self):
        self.send()
        original = self.root / "unrelated"
        original.write_bytes(b"preserve")
        self.manifest.unlink()
        self.manifest.symlink_to(original)
        self.assertEqual(check_archive(self.archive), "invalid_manifest")
        self.manifest.unlink()
        self.send()
        self.archive.chmod(0o666)
        self.assertEqual(check_archive(self.archive), "invalid_archive")
        self.archive.chmod(0o600)
        with patch("offsite_check.LIMIT", 2):
            self.assertEqual(check_archive(self.archive), "invalid_archive")
        self.assertEqual(original.read_bytes(), b"preserve")

    def test_deadline_exits_without_paths_hash_or_exception(self):
        output, error = io.StringIO(), io.StringIO()
        with patch("offsite_check.check", side_effect=DeadlineExceeded), redirect_stdout(output), redirect_stderr(error):
            self.assertEqual(main(["--directory", str(self.root), "--max-age-hours", "30"]), 2)
        self.assertEqual(output.getvalue(), "")
        self.assertNotIn(str(self.root), error.getvalue())
        self.assertNotIn("DeadlineExceeded", error.getvalue())
        with patch("offsite_check.datetime") as clock, redirect_stdout(output):
            clock.now.return_value = NOW
            self.assertEqual(main(["--directory", str(self.root), "--max-age-hours", "30"]), 1)
        self.assertEqual(json.loads(output.getvalue())["freshness"], "missing")

    def test_inventory_cap_and_archive_symlink_never_pass(self):
        self.send()
        for index in range(15):
            path = self.root / NAME.replace("1234abcd", f"{index:08x}")
            path.write_bytes(b"synthetic")
        self.assertEqual(self.probe()["integrity"], "invalid_inventory")
        self.archive.unlink()
        self.archive.symlink_to(self.root / "missing")
        self.assertEqual(check_archive(self.archive), "invalid_archive")
