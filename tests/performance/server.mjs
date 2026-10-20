import { createServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { gzipSync } from 'node:zlib'

const encoding = process.env['HEALTH_BENCH_ENCODING'] ?? 'identity'
if (!['identity', 'gzip'].includes(encoding)) throw new Error('Invalid benchmark encoding')
const root = resolve('dist')
const csp = (await readFile('deploy/nginx.conf', 'utf8'))
  .match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1]
if (!csp) throw new Error('Missing production CSP')
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname
  if (path.startsWith('/api/')) {
    const proxy = request({ hostname: '127.0.0.1', port: 4181, path: req.url,
      method: req.method, headers: req.headers }, upstream => {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers)
      upstream.pipe(res)
    })
    proxy.on('error', () => { res.writeHead(502); res.end() })
    req.pipe(proxy)
    return
  }
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
    const file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path))
    if (!file.startsWith(root + '/')) throw new Error('Invalid path')
    let body = await readFile(file)
    const type = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html',
      '.svg': 'image/svg+xml', '.ttf': 'font/ttf' }[extname(file)] ?? 'application/octet-stream'
    res.setHeader('Content-Type', type)
    res.setHeader('Content-Security-Policy', csp)
    res.setHeader('Cache-Control', 'no-store')
    if (encoding === 'gzip' && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && path.startsWith('/assets/') && /\.(js|css|svg|ttf)$/.test(path)) {
      body = gzipSync(body, { level: 5 })
      res.setHeader('Content-Encoding', 'gzip')
      res.setHeader('Vary', 'Accept-Encoding')
    }
    res.setHeader('Content-Length', body.length)
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch { res.writeHead(404); res.end() }
}).listen(4173, '127.0.0.1')
