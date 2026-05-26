/**
 * 简单静态服务器 — 为 Playwright 测试提供文件服务
 */
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'

const ROOT = join(import.meta.dirname, '../../') // desktop/
const TEST_DIR = import.meta.dirname
const PORT = parseInt(process.env.TEST_PORT || '0')

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.vert': 'text/plain',
  '.frag': 'text/plain',
  '.css': 'text/css',
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let pathname = url.pathname
  let filePath

  if (pathname === '/' || pathname === '/test.html') {
    filePath = join(TEST_DIR, 'test.html')
  } else if (pathname === '/bundle.js' || pathname === '/bundle.js.map') {
    filePath = join(TEST_DIR, 'dist', pathname.slice(1))
  } else if (pathname.startsWith('/lib/') || pathname.startsWith('/live2d/') || pathname.startsWith('/Framework/')) {
    filePath = join(ROOT, 'src/renderer/public', pathname)
  } else {
    filePath = join(ROOT, 'src/renderer/public', pathname)
  }

  console.log(`[REQ] ${pathname}`)
  if (!existsSync(filePath)) {
    console.error(`[404] ${pathname} -> ${filePath}`)
    res.writeHead(404)
    res.end('Not Found')
    return
  }

  const ext = extname(filePath)
  const mime = MIME[ext] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': mime })
  res.end(readFileSync(filePath))
})

server.listen(PORT, () => {
  const port = server.address().port
  console.log(`[Server] 🚀 端口 ${port}`)
  writeFileSync(join(TEST_DIR, '.server-port'), String(port))
})
