/**
 * E2E 测试固件 — Mock Ollama HTTP 服务器
 * @description 模拟 Ollama API，用于 E2E 测试不依赖真实 Ollama 服务
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http'

/** Mock 响应配置 */
interface MockOllamaConfig {
  /** 聊天回复内容 */
  chatResponse?: string
  /** 响应延迟（毫秒） */
  delay?: number
  /** 是否模拟错误 */
  simulateError?: boolean
}

/**
 * 创建 Mock Ollama HTTP 服务器
 * 模拟 Ollama REST API 端点
 */
export function createMockOllamaServer(config: MockOllamaConfig = {}): Server {
  const {
    chatResponse = '这是一个 Mock 回复',
    delay = 0,
    simulateError = false,
  } = config

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay))
    }

    if (simulateError) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal Server Error' }))
      return
    }

    const url = req.url ?? ''

    // POST /api/chat — 聊天完成
    if (url === '/api/chat' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const parsed = JSON.parse(body)

      // 流式响应
      if (parsed.stream) {
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
        })

        const tokens = chatResponse.split('')
        for (const token of tokens) {
          res.write(JSON.stringify({
            model: parsed.model ?? 'qwen2.5:7b',
            created_at: new Date().toISOString(),
            message: { role: 'assistant', content: token },
            done: false,
          }) + '\n')
        }
        res.write(JSON.stringify({
          model: parsed.model ?? 'qwen2.5:7b',
          created_at: new Date().toISOString(),
          message: { role: 'assistant', content: '' },
          done: true,
        }) + '\n')
        res.end()
        return
      }

      // 非流式响应
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        model: parsed.model ?? 'qwen2.5:7b',
        created_at: new Date().toISOString(),
        message: { role: 'assistant', content: chatResponse },
        done: true,
        total_duration: 1_000_000_000,
        eval_count: chatResponse.length,
      }))
      return
    }

    // GET /api/tags — 模型列表
    if (url === '/api/tags' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        models: [
          {
            name: 'qwen2.5:7b',
            model: 'qwen2.5:7b',
            modified_at: new Date().toISOString(),
            size: 4_000_000_000,
            details: {
              format: 'gguf',
              family: 'qwen2',
              parameter_size: '7B',
            },
          },
        ],
      }))
      return
    }

    // POST /api/embeddings — 嵌入向量
    if (url === '/api/embeddings' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        embeddings: [Array.from({ length: 384 }, () => Math.random() - 0.5)],
      }))
      return
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not Found' }))
  })

  return server
}

/**
 * 启动 Mock Ollama 服务器并返回地址
 */
export async function startMockOllama(
  port: number = 11435,
  config?: MockOllamaConfig
): Promise<{ server: Server; url: string; close: () => Promise<void> }> {
  const server = createMockOllamaConfig(config)

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(() => res())),
      })
    })
  })
}

function createMockOllamaConfig(config?: MockOllamaConfig): Server {
  return createMockOllamaServer(config)
}
