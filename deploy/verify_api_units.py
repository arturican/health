#!/usr/bin/python3
"""Check the API unit/policy without installing files or requiring production Node."""
import configparser
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def read_config(path):
    config = configparser.ConfigParser(interpolation=None)
    config.optionxform = str
    with path.open() as source:
        config.read_file(source)
    if config.defaults():
        raise ValueError("systemd does not inherit ConfigParser DEFAULT directives")
    return config


def bounded(value, units, maximum):
    match = re.fullmatch(r'([1-9][0-9]*)([A-Za-z]*)', value)
    if not match or match[2] not in units or int(match[1]) * units[match[2]] > maximum:
        raise ValueError('Journal limit must be positive and bounded')


def verify_api_units(directory=ROOT / 'deploy'):
    unit_path = directory / 'health-api.service'
    unit = read_config(unit_path)['Service']
    for key, value in {'LogNamespace': 'health-diary', 'StandardOutput': 'journal', 'StandardError': 'journal', 'SyslogIdentifier': 'health-api'}.items():
        if unit.get(key) != value:
            raise ValueError('API must use its dedicated journal namespace')
    if unit.get('LogRateLimitIntervalSec') not in ('60s', '1min'):
        raise ValueError('API unit rate interval must be 60s')
    try:
        bounded(unit.get('LogRateLimitBurst', ''), {'': 1}, 120)
    except ValueError as error:
        raise ValueError('API unit rate burst must be positive and no greater than 120') from error
    version = (ROOT / '.nvmrc').read_text().strip()
    command = '/opt/health-node/node-v' + version + '-linux-x64/bin/node build-api/main.js'
    if unit.get('ExecStart') != command:
        raise ValueError('API ExecStart must match the pinned production Node contract')
    policy = read_config(directory / 'health-api-journal.conf')
    if policy.sections() != ['Journal']:
        raise ValueError('Expected Journal section')
    journal = policy['Journal']
    required = {'Storage', 'SystemMaxUse', 'RuntimeMaxUse', 'SystemMaxFileSize', 'RuntimeMaxFileSize',
                'MaxRetentionSec', 'MaxFileSec', 'ForwardToSyslog', 'ForwardToKMsg', 'ForwardToConsole', 'ForwardToWall'}
    if set(journal) != required or journal['Storage'] != 'persistent':
        raise ValueError('Unexpected journal policy fields')
    for field in ('ForwardToSyslog', 'ForwardToKMsg', 'ForwardToConsole', 'ForwardToWall'):
        if journal[field] != 'no':
            raise ValueError('Journal forwarding must be disabled')
    sizes = {'': 1, 'K': 1024, 'M': 1024 * 1024}
    for field, maximum in [('SystemMaxUse', 16 * 1024 * 1024), ('RuntimeMaxUse', 8 * 1024 * 1024),
                           ('SystemMaxFileSize', 1024 * 1024), ('RuntimeMaxFileSize', 1024 * 1024)]:
        bounded(journal[field], sizes, maximum)
    times = {'s': 1, 'min': 60, 'h': 3600, 'day': 86400}
    bounded(journal['MaxRetentionSec'], times, 7 * 86400)
    bounded(journal['MaxFileSec'], times, 3600)
    # Native parser validates all directives; only executable availability is simulated.
    with tempfile.TemporaryDirectory(prefix='health-api-unit-') as temporary:
        candidate = Path(temporary) / 'health-api.service'
        candidate.write_text(unit_path.read_text().replace('ExecStart=' + command, 'ExecStart=/usr/bin/true'))
        subprocess.run(['systemd-analyze', 'verify', str(candidate)], check=True)
    return 'API unit syntax and journal policy accepted; activation/production executable require VPS'


if __name__ == '__main__':
    print(verify_api_units())
