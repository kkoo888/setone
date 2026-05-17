/**
 * Ollama API Mock 工厂
 * @description 模拟 Ollama HTTP API 响应，用于 AI 服务测试
 */
import { vi } from 'vitest'

/** Ollama 模型列表响应 */
export const MOCK_MODELS_RESPONSE = {
  models: [
    {
      name: 'qwen2.5:7b',
      model: 'qwen2.5:7b',
      modified_at: '2026-01-01T00:00:00Z',
      size: 4_000_000_000,
      digest: 'abc123',
      details: {
        parent_model: '',
        format: 'gguf',
        family: 'qwen2',
        families: ['qwen2'],
        parameter_size: '7B',
        quantization_level: 'Q4_0',
      },
    },
    {
      name: 'llava:7b',
      model: 'llava:7b',
      modified_at: '2026-01-01T00:00:00Z',
      size: 4_500_000_000,
      digest: 'def456',
      details: {
        parent_model: '',
        format: 'gguf',
        family: 'llava',
        families: ['llava'],
        parameter_size: '7B',
        quantization_level: 'Q4_0',
      },
    },
  ],
}

/** Ollama 聊天完成响应 */
export function createMockChatResponse(content: string = '这是一个测试回复') {
  return {
    model: 'qwen2.5:7b',
    created_at: '2026-01-01T00:00:00Z',
    message: {
      role: 'assistant' as const,
      content,
    },
    done: true,
    total_duration: 1_000_000_000,
    load_duration: 100_000_000,
    prompt_eval_count: 10,
    eval_count: 20,
    eval_duration: 500_000_000,
  }
}

/** Ollama 流式聊天响应（模拟逐 token 输出） */
export function* createMockStreamResponse(tokens: string[] = ['你', '好', '，', '世界']) {
  for (const token of tokens) {
    yield {
      model: 'qwen2.5:7b',
      created_at: '2026-01-01T00:00:00Z',
      message: {
        role: 'assistant' as const,
        content: token,
      },
      done: false,
    }
  }
  // 最后一个 chunk 标记完成
  yield {
    model: 'qwen2.5:7b',
    created_at: '2026-01-01T00:00:00Z',
    message: {
      role: 'assistant' as const,
      content: '',
    },
    done: true,
    total_duration: 1_000_000_000,
    eval_count: tokens.length,
  }
}

/** Ollama 嵌入向量响应 */
export function createMockEmbeddingResponse(dimensions: number = 384) {
  return {
    embeddings: [Array.from({ length: dimensions }, () => Math.random() - 0.5)],
  }
}

/** 创建 Mock Ollama 客户端 */
export function createMockOllamaClient() {
  return {
    chat: vi.fn().mockResolvedValue(createMockChatResponse()),
    list: vi.fn().mockResolvedValue(MOCK_MODELS_RESPONSE),
    show: vi.fn().mockResolvedValue({
      license: 'MIT',
      modelfile: '',
      parameters: '',
      template: '',
      details: {
        parent_model: '',
        format: 'gguf',
        family: 'qwen2',
        parameter_size: '7B',
      },
    }),
    pull: vi.fn().mockResolvedValue({ status: 'success' }),
    push: vi.fn().mockResolvedValue({ status: 'success' }),
    create: vi.fn().mockResolvedValue({ status: 'success' }),
    copy: vi.fn().mockResolvedValue({ status: 'success' }),
    delete: vi.fn().mockResolvedValue({ status: 'success' }),
    embeddings: vi.fn().mockResolvedValue(createMockEmbeddingResponse()),
    generate: vi.fn().mockResolvedValue(createMockChatResponse()),
  }
}

/** 创建 Mock fetch 响应（用于 HTTP 级别的 mock） */
export function createMockFetch() {
  return vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    // 根据 URL 路径返回不同响应
    if (typeof url === 'string') {
      if (url.includes('/api/chat')) {
        return {
          ok: true,
          status: 200,
          json: async () => createMockChatResponse(),
          body: {
            getReader: () => ({
              read: vi.fn()
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode(JSON.stringify(createMockChatResponse())),
                })
                .mockResolvedValueOnce({ done: true }),
            }),
          },
        }
      }

      if (url.includes('/api/tags')) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_MODELS_RESPONSE,
        }
      }

      if (url.includes('/api/embeddings')) {
        return {
          ok: true,
          status: 200,
          json: async () => createMockEmbeddingResponse(),
        }
      }
    }

    // 默认：404
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not Found' }),
    }
  })
}
