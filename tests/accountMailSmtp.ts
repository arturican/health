import { once } from 'node:events'
import { createServer, type Socket } from 'node:net'

// Local fixture only: never resolves recipient DNS or relays mail.
export async function accountMailSmtp(mode: 'ok' | 'reject' | 'disconnect' | 'silent' | 'hold' = 'ok') {
  const commands: string[] = [], messages: string[] = []
  const sockets = new Set<Socket>(), held = new Set<Socket>()
  const waiters: { count: number; resolve: () => void }[] = []
  const server = createServer(socket => {
    sockets.add(socket)
    socket.on('close', () => { sockets.delete(socket); held.delete(socket) })
    socket.on('error', () => { /* expected disconnects in timeout tests */ })
    if (mode === 'silent') return
    socket.write('220 synthetic.example.test ESMTP\r\n')
    let buffer = '', data: string[] | null = null
    socket.on('data', chunk => {
      buffer += chunk.toString()
      let newline: number
      while ((newline = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 2)
        if (data) {
          if (line !== '.') { data.push(line.replace(/^\.\./, '.')); continue }
          messages.push(data.join('\r\n')); data = null
          for (const waiter of waiters) if (messages.length >= waiter.count) waiter.resolve()
          if (mode === 'hold') held.add(socket)
          else socket.write('250 synthetic accepted\r\n')
          continue
        }
        commands.push(line)
        if (line.startsWith('EHLO')) socket.write('250-synthetic.example.test\r\n250 STARTTLS\r\n')
        else if (line.startsWith('MAIL FROM:')) socket.write('250 sender ok\r\n')
        else if (line.startsWith('RCPT TO:')) {
          if (mode === 'disconnect') socket.destroy()
          else socket.write(mode === 'reject' ? '550 private-recipient@example.test synthetic-secret\r\n' : '250 recipient ok\r\n')
        } else if (line === 'DATA') { data = []; socket.write('354 send data\r\n') }
        else if (line === 'QUIT') socket.end('221 bye\r\n')
        else socket.write('500 unsupported synthetic command\r\n')
      }
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Нет тестового SMTP-порта')
  return {
    port: address.port, commands, messages,
    setMode(value: typeof mode) { mode = value },
    waitForMessages(count: number) {
      return messages.length >= count ? Promise.resolve() : new Promise<void>(resolve => { waiters.push({ count, resolve }) })
    },
    release() { mode = 'ok'; for (const socket of held) socket.write('250 synthetic accepted\r\n'); held.clear() },
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve() }) })
    },
  }
}
