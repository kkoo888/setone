import type { Logger } from '../../../src/main/types/logger'

/** Ollama Embedding API 响应 */
interface OllamaEmbeddingResponse {
  embedding: number[]
}

/**
 * 向量化服务
 * 调用 Ollama 生成文本嵌入向量
 * 支持联网开关、并发控制
 */
export class EmbeddingService {
  private readonly model: string
  private readonly baseUrl: string
  private readonly logger: Logger
  private readonly concurrency: number
  private networkEnabled: boolean

  constructor(logger: Logger, model: string = 'nomic-embed-text', baseUrl: string = 'http://localhost:11434') {
    this.logger = logger
    this.model = model
    this.baseUrl = baseUrl
    this.concurrency = 5
    this.networkEnabled = true
  }

  /** 获取当前嵌入模型名 */
  getModel(): string {
    return this.model
  }

  setNetworkEnabled(enabled: boolean): void {
    this.networkEnabled = enabled
    this.logger.info(`EmbeddingService 联网状态: ${enabled ? '已开启' : '已关闭'}`)
  }

  isNetworkEnabled(): boolean {
    return this.networkEnabled
  }

  /** 生成单个文本的嵌入向量 */
  async embed(text: string): Promise<number[]> {
    if (!this.networkEnabled) {
      throw new Error('联网功能已关闭，无法生成嵌入向量。请在知识库设置中开启联网后重试。')
    }

    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text })
    })

    if (!response.ok) {
      throw new Error(`Ollama embedding 请求失败: ${response.status} ${await response.text()}`)
    }

    return ((await response.json()) as OllamaEmbeddingResponse).embedding
  }

  /**
   * 批量生成嵌入向量（并发控制）
   * 默认 5 并发，避免打爆 Ollama
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.networkEnabled) {
      throw new Error('联网功能已关闭，无法生成嵌入向量。')
    }

    const results: number[][] = new Array(texts.length)
    let index = 0

    const worker = async () => {
      while (index < texts.length) {
        const i = index++
        results[i] = await this.embed(texts[i])
      }
    }

    const workers = Array.from(
      { length: Math.min(this.concurrency, texts.length) },
      () => worker()
    )

    await Promise.all(workers)
    return results
  }
}
