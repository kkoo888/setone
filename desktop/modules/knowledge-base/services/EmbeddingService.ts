import type { Logger } from '../../../src/main/types/logger'

/** Ollama Embedding API 响应 */
interface OllamaEmbeddingResponse {
  embedding: number[]
}

/**
 * 向量化服务
 * 调用 Ollama nomic-embed-text 模型生成文本嵌入向量
 */
export class EmbeddingService {
  private readonly model: string
  private readonly baseUrl: string
  private readonly logger: Logger

  constructor(logger: Logger, model: string = 'nomic-embed-text', baseUrl: string = 'http://localhost:11434') {
    this.logger = logger
    this.model = model
    this.baseUrl = baseUrl
  }

  /**
   * 生成单个文本的嵌入向量
   * @param text - 输入文本
   * @returns 嵌入向量
   */
  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama embedding 请求失败: ${response.status} ${errorText}`)
    }

    const data = (await response.json()) as OllamaEmbeddingResponse
    return data.embedding
  }

  /**
   * 批量生成嵌入向量
   * @param texts - 文本数组
   * @returns 嵌入向量数组
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = []
    for (const text of texts) {
      const embedding = await this.embed(text)
      results.push(embedding)
    }
    return results
  }
}
