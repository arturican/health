import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from backup_send import encrypted_snapshot, transfer, backup

NAME = "health-diary-20261017T000000Z-1234abcd.dump.gpg"


class SendTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name).resolve()
        self.emit = [sys.executable, "-c", "import sys; sys.stdout.buffer.write(b'synthetic diary')"]

    def tearDown(self):
        self.temporary.cleanup()

    def test_real_gpg_roundtrip_and_private_file(self):
        home = self.directory / "gnupg"
        home.mkdir(mode=0o700)
        base = ["gpg", "--homedir", str(home), "--batch"]
        subprocess.run(base + ["--pinentry-mode", "loopback", "--passphrase", "",
                               "--quick-generate-key", "synthetic-backup", "rsa2048", "encr", "0"],
                       check=True, capture_output=True)
        encrypted = encrypted_snapshot([self.emit, base + ["--trust-model", "always",
                                       "--recipient", "synthetic-backup", "--encrypt"]], self.directory, NAME)
        self.assertEqual(encrypted.stat().st_mode & 0o777, 0o600)
        self.assertNotIn(b"synthetic diary", encrypted.read_bytes())
        decrypted = subprocess.run(base + ["--decrypt", str(encrypted)], check=True, capture_output=True)
        self.assertEqual(decrypted.stdout, b"synthetic diary")
        self.assertFalse(list(self.directory.glob(".encrypt-*")))
        with self.assertRaises(FileExistsError):
            encrypted_snapshot([self.emit], self.directory, NAME)
        self.assertEqual(subprocess.run(base + ["--decrypt", str(encrypted)], check=True,
                                        capture_output=True).stdout, b"synthetic diary")
        subprocess.run(["gpgconf", "--homedir", str(home), "--kill", "all"], check=True, capture_output=True)

    def test_every_pipeline_exit_status_is_checked(self):
        failed = [sys.executable, "-c", "import sys; sys.stdout.write('partial'); sys.exit(7)"]
        copy = [sys.executable, "-c", "import sys; sys.stdout.buffer.write(sys.stdin.buffer.read())"]
        for commands in [[failed, copy], [self.emit, failed], [[sys.executable, "-c", "pass"]], []]:
            with self.subTest(commands=commands), self.assertRaises(ValueError):
                encrypted_snapshot(commands, self.directory, NAME)
            self.assertFalse((self.directory / NAME).exists())
            self.assertFalse(list(self.directory.glob(".encrypt-*")))

    def test_limits_and_invalid_name_do_not_publish(self):
        for options in [{"limit": 2}, {"reserve": 2**63}]:
            with self.assertRaises(ValueError):
                encrypted_snapshot([self.emit], self.directory, NAME, **options)
        with self.assertRaises(ValueError):
            encrypted_snapshot([self.emit], self.directory, "../outside")
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_transfer_requires_verified_hash_and_strict_host_key(self):
        path = self.directory / NAME
        path.write_bytes(b"synthetic encrypted bytes")
        config = {"known_hosts": "/private/hosts", "ssh_key": "/private/key", "destination": "backup@example"}
        checksum = hashlib.sha256(path.read_bytes()).hexdigest().encode()
        with patch("backup_send.subprocess.run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = checksum + b"\n"
            transfer(config, path)
            self.assertIn("StrictHostKeyChecking=yes", run.call_args.args[0])
            self.assertIn("IdentitiesOnly=yes", run.call_args.args[0])
            for code, response in [(1, checksum), (0, b"wrong")]:
                run.return_value.returncode, run.return_value.stdout = code, response
                with self.assertRaises(ValueError):
                    transfer(config, path)
        self.assertTrue(path.exists())

    def test_failed_offsite_retry_keeps_all_local_copies(self):
        for index in range(8):
            (self.directory / NAME.replace("1234abcd", f"{index:08x}")).write_bytes(b"ciphertext")
        retry = NAME.replace("1234abcd", "00000007")
        config = {"directory": str(self.directory)}
        with patch("backup_send.transfer", side_effect=ValueError("synthetic offline")):
            with self.assertRaises(ValueError):
                backup(config, retry=retry)
        self.assertEqual(len(list(self.directory.glob("*.gpg"))), 8)
        with patch("backup_send.transfer"):
            self.assertEqual(backup(config, retry=retry), retry)
        self.assertEqual(len(list(self.directory.glob("*.gpg"))), 7)
        with self.assertRaises(ValueError):
            backup(config, retry="../outside")


if __name__ == "__main__":
    unittest.main()
