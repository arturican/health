import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

process.chdir(fileURLToPath(new URL('..', import.meta.url)))
try {
  if (process.argv.length !== 3 || !process.argv[2].endsWith('.pub')) throw new Error('Укажите только public key: npm run secrets:grant -- /путь/новый-компьютер.pub')
  const path = resolve(process.argv[2])
  if (spawnSync('ssh-keygen', ['-lf', path], { stdio: 'ignore' }).status !== 0) throw new Error('Не распознан SSH public key.')
  const publicKey = readFileSync(path, 'utf8').trim()
  if (publicKey.includes('\n')) throw new Error('Укажите файл только с одним public key.')
  const fields = publicKey.split(/\s+/)
  if (!/^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp\d+)$/.test(fields[0]) || !/^[A-Za-z0-9+/=]+$/.test(fields[1])) throw new Error('Некорректный public key.')
  const config = JSON.parse(readFileSync('config/development-secrets.json', 'utf8'))
  if (!/^health-dev-secrets@[a-zA-Z0-9.-]+$/.test(config.destination)) throw new Error('Некорректная SSH конфигурация.')
  const code = `import os,sys,tempfile,fcntl
from pathlib import Path
p=Path('/var/lib/health-dev-secrets/.ssh/authorized_keys')
if os.geteuid()!=0 or p.is_symlink() or p.stat().st_uid!=0: raise ValueError('Invalid account file')
lock=os.open(p.parent/'.grant.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
fcntl.flock(lock,fcntl.LOCK_EX)
previous=p.read_text()
prefix='restrict,command="/usr/local/libexec/health-development-secrets" '
if any(line.strip() and not line.startswith(('#',prefix)) for line in previous.splitlines()): raise ValueError('Unexpected entry')
entry=prefix+sys.stdin.read().strip()
if entry not in previous.splitlines():
 fd,temp=tempfile.mkstemp(dir=p.parent)
 with os.fdopen(fd,'w') as stream: stream.write(previous.rstrip('\\n')+'\\n'+entry+'\\n')
 os.chmod(temp,0o644)
 os.replace(temp,p)
`
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
  const result = spawnSync('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${resolve(config.knownHostsFile)}`, '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes',
    '-o', 'ConnectTimeout=10', `root@${config.destination.split('@')[1]}`, `python3 -c ${quote(code)}`],
  { input: `${fields[0]} ${fields[1]}\n`, encoding: 'utf8', timeout: 30000 })
  if (result.status !== 0) throw new Error('Доступ не добавлен: выполните команду на компьютере с существующим operator SSH-доступом.')
  process.stdout.write('Public key добавлен только для development secrets; shell/forwarding запрещены.\n')
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
