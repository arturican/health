import { startApi } from './runtime.js'

try {
  const app = await startApi(process.env)
  let closing = false
  const close = () => {
    if (closing) return
    closing = true
    // Allow the 120-second request deadline to finish before forced shutdown.
    const deadline = setTimeout(() => { process.exit(1) }, 125000)
    deadline.unref()
    void app.close().then(() => {
      clearTimeout(deadline)
      process.removeListener('SIGINT', close)
      process.removeListener('SIGTERM', close)
    }).catch(() => {
      process.stderr.write('Не удалось остановить API\n')
      process.exitCode = 1
    })
  }
  process.on('SIGINT', close)
  process.on('SIGTERM', close)
  process.stdout.write('API запущен\n')
} catch {
  process.stderr.write('Не удалось запустить API: проверьте серверные настройки и доступность порта\n')
  process.exitCode = 1
}
