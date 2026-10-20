import io
import gzip
import os
import subprocess
import sys
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import install_release as receiver
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

    def test_expanded_metadata_is_rejected_before_tar_parser_or_writes(self):
        limit = 64 * 1024
        for kind in ('pax', 'gnu', 'repeated'):
            stream = io.BytesIO()
            with tarfile.open(fileobj=stream, mode='w:gz',
                              format=tarfile.GNU_FORMAT if kind == 'gnu' else tarfile.PAX_FORMAT) as bundle:
                for index in range(80 if kind == 'repeated' else 1):
                    member = tarfile.TarInfo('assets/app-' + str(index) + '.js')
                    if kind == 'gnu':
                        member.name = 'assets/' + 'x' * (limit * 2) + '.js'
                    else:
                        member.pax_headers = {'comment': 'x' * (1024 if kind == 'repeated' else limit * 2)}
                    member.size = 1
                    bundle.addfile(member, io.BytesIO(b'x'))
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                base = Path(directory)
                install(archive(), 'a' * 40, base)
                before = {str(path.relative_to(base)): path.read_bytes()
                          for path in base.rglob('*') if path.is_file()}
                stream.seek(0)
                with patch.object(receiver, 'MAX_EXPANDED', limit, create=True), patch(
                        'install_release.tarfile.open', side_effect=AssertionError('Parser ran before size check')) as parser:
                    with self.assertRaisesRegex(ValueError, 'Expanded archive exceeds'):
                        install(stream, 'b' * 40, base)
                    parser.assert_not_called()
                self.assertEqual((base / 'current/release.txt').read_text().strip(), 'a' * 40)
                self.assertEqual(before, {str(path.relative_to(base)): path.read_bytes()
                                         for path in base.rglob('*') if path.is_file()})

    def test_small_pax_metadata_is_accepted_and_truncated_gzip_is_rejected(self):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz', format=tarfile.PAX_FORMAT) as bundle:
            for name in ('index.html', 'assets/app.js'):
                member = tarfile.TarInfo(name)
                member.pax_headers = {'comment': 'synthetic metadata'}
                member.size = 1
                bundle.addfile(member, io.BytesIO(b'x'))
        stream.seek(0)
        self.assertEqual(set(read_build(stream)), {'index.html', 'assets/app.js'})
        with self.assertRaisesRegex(ValueError, 'Invalid compressed archive'):
            read_build(io.BytesIO(stream.getvalue()[:-8]))

    def test_exact_expanded_boundary_trailing_byte_concatenated_gzip_and_crc(self):
        payload = gzip.decompress(archive().getvalue())
        with patch.object(receiver, 'MAX_EXPANDED', len(payload)):
            self.assertIn('index.html', read_build(io.BytesIO(gzip.compress(payload))))
            for oversized in (gzip.compress(payload + b'x'),
                              gzip.compress(payload) + gzip.compress(b'x')):
                with self.assertRaisesRegex(ValueError, 'Expanded archive exceeds'):
                    read_build(io.BytesIO(oversized))
        corrupt = bytearray(archive().getvalue())
        corrupt[-8] ^= 1
        with self.assertRaisesRegex(ValueError, 'Invalid compressed archive'):
            read_build(io.BytesIO(corrupt))

    def test_bad_deflate_is_normalized_before_parser_and_file_payload_cap_remains(self):
        invalid_deflate = bytes.fromhex('1f8b0800000000000003') + b'\x07' + b'\x00' * 8
        with patch('install_release.tarfile.open', side_effect=AssertionError('Invalid gzip reached parser')) as parser:
            with self.assertRaisesRegex(ValueError, 'Invalid compressed archive'):
                read_build(io.BytesIO(invalid_deflate))
            parser.assert_not_called()
        build = archive()
        with patch.object(receiver, 'MAX_CONTENT', 1):
            with self.assertRaisesRegex(ValueError, 'Build exceeds 50 MiB'):
                read_build(build)

    def test_receiver_cli_reports_corrupt_deflate_without_traceback(self):
        result = subprocess.run(
            [sys.executable, '-B', str(Path(__file__).with_name('install_release.py'))],
            input=bytes.fromhex('1f8b0800000000000003') + b'\x07' + b'\x00' * 8,
            capture_output=True, check=False,
            env={'SSH_ORIGINAL_COMMAND': 'deploy ' + 'a' * 40},
        )
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b'')
        self.assertEqual(result.stderr, b'Deployment rejected: Invalid compressed archive\n')

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
