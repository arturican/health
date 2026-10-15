#!/usr/bin/python3
"""Validate the actual production tar using the restricted receiver's parser."""
import io
from pathlib import Path
import subprocess
import sys
from install_release import read_build


def verify_build(directory):
    result = subprocess.run(
        ['tar', '-czf', '-', '-C', str(directory), '.'],
        stdout=subprocess.PIPE, check=True,
    )
    files = read_build(io.BytesIO(result.stdout))
    license_bytes = (Path(__file__).resolve().parent.parent /
                     'public/assets/Roboto-LICENSE.txt').read_bytes()
    if files.get('assets/Roboto-LICENSE.txt') != license_bytes:
        raise ValueError('Build must preserve the bundled Roboto license')
    return len(files)


if __name__ == '__main__':
    count = verify_build(Path(sys.argv[1] if len(sys.argv) > 1 else 'dist'))
    print(f'Production archive accepted: {count} files; Roboto license preserved')
