import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from install_release import install, read_build
from verify_build import verify_build


def archive(entries=None):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w:gz') as bundle:
        for name, data, kind in entries or [
            ('index.html', b'<html>synthetic</html>', tarfile.REGTYPE),
            ('assets/app-123.js', b'/* synthetic */', tarfile.REGTYPE),
        ]:
            member = tarfile.TarInfo(name)
            member.size = len(data)
            member.type = kind
            member.linkname = '/tmp/forbidden'
            bundle.addfile(member, io.BytesIO(data))
    stream.seek(0)
    return stream


class Releases(unittest.TestCase):
    def test_actual_archive_preserves_license_in_supported_assets_directory(self):
        license_bytes = (Path(__file__).resolve().parent.parent /
                         'public/assets/Roboto-LICENSE.txt').read_bytes()
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)
            (build / 'assets').mkdir()
            (build / 'index.html').write_bytes(b'<html>synthetic</html>')
            (build / 'assets/app.js').write_bytes(b'/* synthetic */')
            (build / 'Roboto-LICENSE.txt').write_bytes(license_bytes)
            with self.assertRaisesRegex(ValueError, 'Invalid or duplicate archive entry'):
                verify_build(build)
            (build / 'Roboto-LICENSE.txt').rename(build / 'assets/Roboto-LICENSE.txt')
            self.assertEqual(verify_build(build), 3)
            (build / 'assets/Roboto-LICENSE.txt').write_bytes(b'truncated license')
            with self.assertRaisesRegex(ValueError, 'preserve the bundled Roboto license'):
                verify_build(build)

    def test_install_repeat_and_previous_release(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            install(archive(), 'a' * 40, base)
            install(archive(), 'b' * 40, base)
            install(archive(), 'b' * 40, base)
            self.assertEqual((base / 'current/release.txt').read_text().strip(), 'b' * 40)
            self.assertEqual((base / 'previous/release.txt').read_text().strip(), 'a' * 40)
            self.assertEqual((base / 'assets/app-123.js').read_bytes(), b'/* synthetic */')
            # Same atomic operation used by the documented administrative rollback.
            (base / 'rollback.next').symlink_to(os.readlink(base / 'previous'))
            (base / 'rollback.next').replace(base / 'current')
            self.assertEqual((base / 'current/release.txt').read_text().strip(), 'a' * 40)

    def test_bad_archives_never_change_current(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            install(archive(), 'a' * 40, base)
            for name, kind in [('../escape', tarfile.REGTYPE), ('/absolute', tarfile.REGTYPE),
                               ('assets/link.js', tarfile.SYMTYPE), ('assets/hard.js', tarfile.LNKTYPE),
                               ('.env', tarfile.REGTYPE), ('assets/../../escape', tarfile.REGTYPE)]:
                with self.subTest(name=name), self.assertRaises(ValueError):
                    install(archive([(name, b'x', kind)]), 'b' * 40, base)
                self.assertEqual((base / 'current/release.txt').read_text().strip(), 'a' * 40)

    def test_missing_invalid_duplicate_and_large_input(self):
        for data in [b'', b'invalid gzip', b'x' * (20 * 1024 * 1024 + 1)]:
            with self.assertRaises((ValueError, tarfile.TarError)):
                read_build(io.BytesIO(data))
        with self.assertRaises(ValueError):
            read_build(archive([('index.html', b'x', tarfile.REGTYPE)]))
        with self.assertRaises(ValueError):
            read_build(archive([('index.html', b'x', tarfile.REGTYPE)] * 2))
        with self.assertRaises(ValueError):
            install(archive(), '../bad')

    def test_collision_does_not_switch_release(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            install(archive(), 'a' * 40, base)
            for revision, entries in [('a' * 40, [('index.html', b'changed', tarfile.REGTYPE),
                                                 ('assets/new.js', b'new', tarfile.REGTYPE)]),
                                       ('b' * 40, [('index.html', b'changed', tarfile.REGTYPE),
                                                 ('assets/app-123.js', b'changed', tarfile.REGTYPE)])]:
                with self.subTest(revision=revision), self.assertRaises(ValueError):
                    install(archive(entries), revision, base)
                self.assertEqual((base / 'current/release.txt').read_text().strip(), 'a' * 40)


if __name__ == '__main__':
    unittest.main()
