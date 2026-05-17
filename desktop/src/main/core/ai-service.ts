import type {
  AIService,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  IntentResult
} from '../types/ai'
import type { ConfigManager } from '../types/config'
import type { Logger } from '../types/logger'

/** 默认超时时间（ms） */
const DEFAULT_TIMEOUT_MS = 120000
/** 短请求超时（ms）— 用于健康检查等 */
const SHORT_TIMEOUT_MS = 5000

/**
 * Ollama AI 服务实现
 * 封装 Ollama REST API，支持对话、流式输出、图片分析、意图识别、嵌入向量
 *
 * @author 小茜
 * @date 2026-05-15
 */
export class OllamaAIService implements AIService {
  private baseUrl = 'http://localhost:11434'
  private model = 'ministral:3b'
  private visionModel = 'qwen2.5-vl'
  private embeddingModel = 'nomic-embed-text'
  private timeout = DEFAULT_TIMEOUT_MS
  private logger: Logger
  private configReady: Promise<void>

  constructor(config: ConfigManager, logger: Logger) {
    this.logger = logger
    this.configReady = this.loadConfig(config)
    // 监听配置变更，实时同步
    config.onChange((key, value) => {
      switch (key) {
        case 'ollama.baseUrl': this.baseUrl = value as string; break
        case 'ollama.model': this.model = value as string; break
        case 'ollama.visionModel': this.visionModel = value as string; break
        case 'ollama.embeddingModel': this.embeddingModel = value as string; break
        case 'ollama.timeout': this.timeout = value as number; break
      }
    })
  }

  /** 确保配置已加载完成 */
  private async ensureConfigReady(): Promise<void> {
    await this.configReady
  }

  private async loadConfig(config: ConfigManager): Promise<void> {
    this.baseUrl = await config.get('ollama.baseUrl', 'http://localhost:11434')
    this.model = await config.get('ollama.model', 'ministral:3b')
    this.visionModel = await config.get('ollama.visionModel', 'qwen2.5-vl')
    this.embeddingModel = await config.get('ollama.embeddingModel', 'nomic-embed-text')
    this.timeout = await config.get('ollama.timeout', DEFAULT_TIMEOUT_MS)
  }

  /** 检查 Ollama 是否可用 */
  async isAvailable(): Promise<boolean> {
    await this.ensureConfigReady()
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(SHORT_TIMEOUT_MS)
      })
      return response.ok
    } catch {
      return false
    }
  }

  /** 对话请求 */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    await this.ensureConfigReady()
    const body = {
      model: options?.model ?? this.model,
      messages: this.formatMessages(messages),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048
      },
      tools: options?.tools
    }

    const response = await this.fetchWithTimeout('/api/chat', body) as ChatResponse
    if (!response?.message?.content) {
      throw new Error(`Ollama 返回格式异常: ${JSON.stringify(response).slice(0, 200)}`)
    }
    return response
  }

  /** 流式对话 */
  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<ChatChunk> {
    await this.ensureConfigReady()
    const body = {
      model: options?.model ?? this.model,
      messages: this.formatMessages(messages),
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048
      },
      tools: options?.tools
    }

    const controller = new AbortController()
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`Ollama 请求失败: ${response.status} ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法获取响应流')

    const decoder = new TextDecoder()
    let buffer = ''
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    /** 重置空闲定时器：超过 timeout 没收到新数据则中断 */
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => controller.abort(), this.timeout)
    }

    try {
      resetIdle()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        resetIdle()

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            yield JSON.parse(line) as ChatChunk
          } catch {
            // 跳过不完整的行
          }
        }
      }

      // flush 尾部
      buffer += decoder.decode()
      if (buffer.trim()) {
        try {
          yield JSON.parse(buffer.trim()) as ChatChunk
        } catch {
          // 忽略残留数据
        }
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer)
      reader.releaseLock()
    }
  }

  /** 分析图片 */
  async analyzeImage(base64Image: string, prompt: string): Promise<string> {
    await this.ensureConfigReady()
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: prompt,
        images: [base64Image.replace(/^data:image\/\w+;base64,/, '')]
      }
    ]

    const response = await this.fetchWithTimeout('/api/chat', {
      model: this.visionModel,
      messages,
      stream: false
    }) as ChatResponse

    if (!response?.message?.content) {
      throw new Error(`Ollama 返回格式异常: ${JSON.stringify(response).slice(0, 200)}`)
    }
    return response.message.content
  }

  /** 意图识别 */
  async recognizeIntent(input: string, capabilities: string[]): Promise<IntentResult> {
    const systemPrompt = `你是一个意图识别引擎。根据用户输入，判断用户想要使用哪个功能模块。

可用功能模块：
${capabilities.map(c => `- ${c}`).join('\n')}

请返回 JSON 格式：
{
  "intent": "模块名称",
  "confidence": 0.0-1.0,
  "params": { ... }
}

如果无法判断，intent 设为 "general"，confidence 设为 0。`

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input }
    ]

    const response = await this.chat(messages, { temperature: 0.1 })

    try {
      const parsed = this.extractJSON(response.message.content)
      if (parsed && this.isValidIntentResult(parsed)) {
        return parsed as IntentResult
      }
    } catch (err) {
      this.logger.error('意图识别结果解析失败', err as Error)
    }

    return { intent: 'general', confidence: 0, params: {} }
  }

  /** 生成嵌入向量 */
  async embed(text: string, model?: string): Promise<number[]> {
    await this.ensureConfigReady()
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model ?? this.embeddingModel,
        prompt: text
      }),
      signal: AbortSignal.timeout(this.timeout)
    })

    if (!response.ok) {
      throw new Error(`Ollama 请求失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.embedding
  }

  /** 校验 IntentResult 基本结构 */
  private isValidIntentResult(obj: Record<string, unknown>): boolean {
    return typeof obj.intent === 'string' && obj.intent.length > 0
      && (obj.confidence === undefined || typeof obj.confidence === 'number')
      && (obj.params === undefined || (typeof obj.params === 'object' && obj.params !== null))
  }

  /** 从文本中提取 JSON 对象 */
  private extractJSON(text: string): Record<string, unknown> | null {
    // 策略 1：```json 代码块
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    if (codeBlockMatch) {
      const result = this.safeParseJsonObject(codeBlockMatch[1].trim())
      if (result) return result
    }

    // 策略 2：花括号配对提取
    const firstBrace = text.indexOf('{')
    if (firstBrace !== -1) {
      let depth = 0
      let inString = false
      let escapeNext = false
      for (let i = firstBrace; i < text.length; i++) {
        const ch = text[i]
        if (escapeNext) { escapeNext = false; continue }
        if (ch === '\\' && inString) { escapeNext = true; continue }
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === '{') depth++
        else if (ch === '}') depth--
        if (depth === 0) {
          const result = this.safeParseJsonObject(text.slice(firstBrace, i + 1))
          if (result) return result
          break
        }
      }
    }

    // 策略 3：非贪婪匹配回退
    const conservativeMatch = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/)
    if (conservativeMatch) {
      const result = this.safeParseJsonObject(conservativeMatch[0])
      if (result) return result
    }

    return null
  }

  /** 安全解析 JSON 字符串 */
  private safeParseJsonObject(raw: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch { /* 解析失败，静默降级 */ }
    return null
  }

  /** 带超时的 fetch */
  private async fetchWithTimeout(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout)
    })

    if (!response.ok) {
      throw new Error(`Ollama 请求失败: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  /** 格式化消息 */
  private formatMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(m => ({
      ...m,
      images: m.role === 'user'
        ? m.images?.map(img => img.replace(/^data:image\/\w+;base64,/, ''))
        : m.images
    }))
  }
}
