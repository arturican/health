import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from backup_receive import receive, prune

NAME = "health-diary-20261017T000000Z-1234abcd.dump.gpg"
CLUSTER = "health-cluster-20261017T000000Z-1234abcd.sql.gz.gpg"


class ReceiveTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name).resolve()

    def tearDown(self):
        self.temporary.cleanup()

    def send(self, value=b"synthetic encrypted bytes", name=NAME, **options):
        checksum = hashlib.sha256(value).hexdigest()
        return receive(self.directory, name + " " + checksum, io.BytesIO(value), **options)

    def test_exact_bytes_private_mode_idempotency_and_conflict(self):
        self.send()
        target = self.directory / NAME
        self.assertEqual(target.read_bytes(), b"synthetic encrypted bytes")
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        inode = target.stat().st_ino
        self.send()
        self.assertEqual(target.stat().st_ino, inode)
        with self.assertRaises(ValueError):
            self.send(b"different")
        self.assertEqual(target.read_bytes(), b"synthetic encrypted bytes")
        self.assertFalse(list(self.directory.glob(".receive-*")))

    def test_attestation_is_exact_private_atomic_and_retryable(self):
        checksum = self.send()
        manifest = self.directory / (NAME + ".sha256")
        self.assertEqual(manifest.read_text(), checksum + "\n")
        self.assertEqual(manifest.stat().st_mode & 0o777, 0o600)
        manifest.unlink()
        with patch("backup_receive.os.replace", side_effect=OSError("synthetic failure")):
            with self.assertRaises(OSError):
                self.send()
        self.assertTrue((self.directory / NAME).is_file())
        self.assertFalse(manifest.exists())
        self.assertEqual(self.send(), checksum)
        self.assertEqual(manifest.read_text(), checksum + "\n")
        self.assertFalse(list(self.directory.glob(".manifest-*")))

    def test_mismatched_stream_does_not_create_attestation(self):
        with self.assertRaises(ValueError):
            receive(self.directory, NAME + " " + "0"*64, io.BytesIO(b"synthetic"))
        self.assertFalse((self.directory / (NAME + ".sha256")).exists())

    def test_manifest_symlink_never_overwrites_referenced_file(self):
        unrelated = self.directory / "private"
        unrelated.write_bytes(b"preserve")
        manifest = self.directory / (NAME + ".sha256")
        manifest.symlink_to(unrelated)
        self.send()
        self.assertFalse(manifest.is_symlink())
        self.assertEqual(unrelated.read_bytes(), b"preserve")

    def test_untrusted_names_and_hash_never_escape_directory(self):
        for name in ["../outside", "/tmp/outside", NAME + " extra", "health-diary-2026.dump.gpg"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.send(name=name)
        with self.assertRaises(ValueError):
            receive(self.directory, NAME + " " + "0" * 64, io.BytesIO(b"wrong"))
        self.assertFalse((self.directory / NAME).exists())
        self.assertFalse(list(self.directory.glob(".receive-*")))

    def test_interrupted_stream_leaves_no_partial_file(self):
        class Interrupted:
            def read(self, _size):
                raise TimeoutError("Synthetic interruption")
        with self.assertRaises(TimeoutError):
            receive(self.directory, NAME + " " + "0" * 64, Interrupted())
        self.assertFalse(list(self.directory.glob(".receive-*")))
        self.assertFalse((self.directory / NAME).exists())

    def test_limits_and_empty_stream_leave_no_backup(self):
        for value, limit in [(b"", 100), (b"too large", 3)]:
            with self.assertRaises(ValueError):
                self.send(value, limit=limit)
        with patch("backup_receive.shutil.disk_usage") as usage:
            usage.return_value.free = 1
            with self.assertRaises(ValueError):
                self.send()
        self.assertFalse((self.directory / NAME).exists())
        self.assertFalse(list(self.directory.glob(".receive-*")))

    def test_symlink_target_directory_and_lock_are_rejected(self):
        original = self.directory / "unrelated"
        original.write_bytes(b"preserve")
        target = self.directory / NAME
        target.symlink_to(original)
        with self.assertRaises(ValueError):
            self.send()
        target.unlink()
        (self.directory / ".receive.lock").symlink_to(original)
        with self.assertRaises(OSError):
            self.send()
        (self.directory / ".receive.lock").unlink()
        alias = self.directory / "alias"
        alias.symlink_to(self.directory, target_is_directory=True)
        with self.assertRaises(ValueError):
            receive(alias, NAME + " " + "0" * 64, io.BytesIO(b"x"))
        self.assertEqual(original.read_bytes(), b"preserve")

    def test_retention_preserves_cluster_unrelated_and_symlinks(self):
        self.send(name=CLUSTER)
        unrelated = self.directory / "unrelated.gpg"
        unrelated.write_bytes(b"preserve")
        names = [f"health-diary-20261017T0000{index:02d}Z-1234abcd.dump.gpg" for index in range(16)]
        for name in names:
            self.send(name=name)
        self.assertFalse((self.directory / names[0]).exists())
        self.assertFalse((self.directory / (names[0] + ".sha256")).exists())
        self.assertTrue((self.directory / (names[-1] + ".sha256")).is_file())
        self.assertTrue((self.directory / names[-1]).exists())
        self.assertTrue((self.directory / CLUSTER).exists())
        alias = self.directory / names[0]
        alias.symlink_to(unrelated)
        prune(self.directory, 1)
        self.assertTrue(alias.is_symlink())
        self.assertEqual(unrelated.read_bytes(), b"preserve")
        self.assertTrue((self.directory / CLUSTER).exists())


if __name__ == "__main__":
    unittest.main()
