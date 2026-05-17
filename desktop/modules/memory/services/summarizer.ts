import type { Logger } from '../../../src/main/types/logger'
import type { MemoryItem } from './memory-manager'

/** Ollama API 聊天响应 */
interface OllamaChatResponse {
  model: string
  message: { role: string; content: string }
  done: boolean
}

export class Summarizer {
  private logger: Logger
  private ollamaBaseUrl: string
  private ollamaModel: string

  constructor(logger: Logger, options?: { ollamaBaseUrl?: string; ollamaModel?: string }) {
    this.logger = logger
    this.ollamaBaseUrl = options?.ollamaBaseUrl ?? 'http://localhost:11434'
    this.ollamaModel = options?.ollamaModel ?? 'qwen2.5'
  }

  /**
   * 将多条短期记忆压缩为一条 AI 摘要
   * 优先调用 Ollama 生成智能摘要，失败时回退到简单拼接
   */
  async summarize(items: MemoryItem[]): Promise<string> {
    if (items.length === 0) return ''

    const sorted = [...items].sort((a, b) => a.timestamp - b.timestamp)

    try {
      const aiSummary = await this.aiSummarize(sorted)
      if (aiSummary) {
        this.logger.info(`AI 摘要生成成功: ${items.length} 条 → 1 条`)
        return aiSummary
      }
    } catch (err) {
      this.logger.warn('AI 摘要失败，回退到简单拼接', { error: (err as Error).message })
    }

    // 回退：简单拼接
    const summary = sorted.map((i) => i.content).join('\n')
    this.logger.info(`简单摘要生成: ${items.length} 条 → 1 条`)
    return `[摘要] 共${items.length}条记忆：${summary.slice(0, 500)}`
  }

  /**
   * 调用 Ollama 视觉/文本模型生成摘要
   */
  private async aiSummarize(items: MemoryItem[]): Promise<string | null> {
    const memoryText = items
      .map((item, i) => {
        const time = new Date(item.timestamp).toLocaleString('zh-CN')
        const tags = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : ''
        return `${i + 1}. [${time}]${tags} ${item.content}`
      })
      .join('\n')

    const prompt = `请将以下多条记忆压缩为一段简洁的长期记忆摘要。
要求：
1. 保留关键信息和重要事实
2. 去除重复和无关紧要的细节
3. 按时间顺序组织
4. 保持客观，不添加推测
5. 输出纯文本，不要使用 markdown 格式

记忆列表：
${memoryText}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)

    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.ollamaModel,
          messages: [{ role: 'user', content: prompt }],
          stream: false
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`Ollama API 返回 ${response.status}`)
      }

      const data = (await response.json()) as OllamaChatResponse
      const content = data.message?.content?.trim()
      return content || null
    } finally {
      clearTimeout(timeout)
    }
  }
}
