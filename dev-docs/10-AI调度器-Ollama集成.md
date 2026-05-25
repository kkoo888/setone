# 10-AI调度器-Ollama集成

> **前置依赖**：版块7,9  
> **预计工作量**：2天  
> **版块**：10  
> **说明**：Ollama调用、意图识别、结构化结果返回

---

## 版块 10：AI 调度器（Ollama 集成）

### 10.1 目录结构

```
src/main/core/
├── ai-service.ts                # AI 服务实现（Ollama 客户端）
├── ai-dispatcher.ts             # 意图识别与路由分发
└── index.ts                     # AI 调度器模块导出
src/main/types/
├── ai.ts                        # AI 相关类型定义
├── config.ts                    # ConfigManager 接口
└── logger.ts                    # Logger 接口
tests/unit/
├── ai-service.test.ts
└── ai-dispatcher.test.ts
```

### 10.2 类型定义

**src/main/types/ai.ts**：

```typescript
/** AI 服务接口 */
export interface AIService {
  /** 发送对话请求 */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>
  /** 流式对话 */
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<ChatChunk>
  /** 分析图片 */
  analyzeImage(base64Image: string, prompt: string): Promise<string>
  /** 意图识别 */
  recognizeIntent(input: string, capabilities: string[]): Promise<IntentResult>
  /** 生成嵌入向量 */
  embed(text: string, model?: string): Promise<number[]>
}

/** 对话消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  images?: string[]
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

/** 工具调用 */
export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** 对话选项 */
export interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  tools?: ToolDefinition[]
  stream?: boolean
}

/** 工具定义 */
export interface ToolDefinition {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

/** 对话响应 */
export interface ChatResponse {
  message: ChatMessage
  done: boolean
  totalDuration?: number
  evalCount?: number
}

/** 流式对话块 */
export interface ChatChunk {
  message: { content?: string; tool_calls?: ToolCall[] }
  done: boolean
}

/** 意图识别结果 */
export interface IntentResult {
  intent: string
  confidence: number
  params: Record<string, unknown>
  moduleId?: string
}
```

### 10.3 开发步骤

#### 步骤 1：实现 Ollama 客户端

**src/main/core/ai-service.ts**：

```typescript
import type {
  AIService, ChatMessage, ChatOptions, ChatResponse, ChatChunk, IntentResult
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

  /** 对话请求（支持 options.model 覆盖默认模型） */
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

  /** 流式对话（AbortController + 空闲定时器，超过 timeout 没收到新数据则中断） */
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

    /** 重置空闲定时器 */
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

  /** 从文本中提取 JSON 对象（三级策略：代码块 > 花括号配对 > 非贪婪回退） */
  private extractJSON(text: string): Record<string, unknown> | null {
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    if (codeBlockMatch) {
      const result = this.safeParseJsonObject(codeBlockMatch[1].trim())
      if (result) return result
    }

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

  /** 格式化消息（剥离 user 消息中的 data URL 前缀） */
  private formatMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(m => ({
      ...m,
      images: m.role === 'user'
        ? m.images?.map(img => img.replace(/^data:image\/\w+;base64,/, ''))
        : m.images
    }))
  }
}
```

#### 步骤 2：实现 AI 调度器

**src/main/core/ai-dispatcher.ts**：

```typescript
import type { AIService, ChatMessage, IntentResult } from '../types/ai'
import type { Logger } from '../types/logger'

/** 调度结果 */
export interface DispatchResult {
  response: string
  moduleId?: string
  toolCalls?: Array<{
    id: string
    name: string
    arguments?: Record<string, unknown>
    result?: unknown
    error?: string
    status?: 'running' | 'success' | 'error'
    durationMs?: number
  }>
}

/** 连续失败阈值 */
const MAX_CONSECUTIVE_FAILURES = 3
/** 默认系统提示词 */
const DEFAULT_SYSTEM_PROMPT = '你是一个友好的桌面助手。用简洁亲切的方式回答用户问题。'

/**
 * AI 调度器
 * 负责意图识别、路由分发、通用对话
 */
export class AIDispatcher {
  private consecutiveFailures = new Map<string, number>()
  private disabledModules = new Set<string>()
  private systemPrompt: string

  constructor(
    private ai: AIService,
    private logger: Logger,
    config?: { systemPrompt?: string }
  ) {
    this.systemPrompt = config?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  }

  /**
   * 处理用户输入：意图识别 → 路由 → 响应
   */
  async dispatch(input: string, history: ChatMessage[]): Promise<DispatchResult> {
    const capabilities: string[] = []
    const intent = await this.ai.recognizeIntent(input, capabilities)
    this.logger.info('意图识别结果', { intent: intent.intent, confidence: intent.confidence })

    if (intent.confidence >= 0.8) {
      if (this.disabledModules.has(intent.intent)) {
        return {
          response: `模块 "${intent.intent}" 因连续失败已被自动禁用，请联系管理员重新启用。`
        }
      }
      return this.executeIntent(intent, input, history)
    }

    // 低置信度：回退到通用对话
    return this.generalChat(input, history)
  }

  /** 执行意图 */
  private async executeIntent(
    intent: IntentResult,
    input: string,
    history: ChatMessage[]
  ): Promise<DispatchResult> {
    try {
      this.logger.info(`执行意图: ${intent.intent}`, { params: intent.params })
      this.consecutiveFailures.delete(intent.intent)

      return {
        response: `已识别意图 "${intent.intent}"，正在处理...`,
        moduleId: intent.intent
      }
    } catch (err) {
      this.logger.error(`模块 "${intent.intent}" 执行失败`, err as Error)

      const failCount = (this.consecutiveFailures.get(intent.intent) ?? 0) + 1
      this.consecutiveFailures.set(intent.intent, failCount)

      if (failCount >= MAX_CONSECUTIVE_FAILURES) {
        this.disabledModules.add(intent.intent)
        this.logger.warn(
          `模块 "${intent.intent}" 已连续失败 ${failCount} 次，已自动禁用`
        )
      }

      return {
        response: `执行 "${intent.intent}" 时遇到了问题：${(err as Error).message}`,
        moduleId: intent.intent
      }
    }
  }

  /** 通用对话 */
  private async generalChat(input: string, history: ChatMessage[]): Promise<DispatchResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...history.slice(-10),
      { role: 'user', content: input }
    ]

    const response = await this.ai.chat(messages)
    return { response: response.message.content }
  }

  /** 运行时更新系统提示词 */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt || DEFAULT_SYSTEM_PROMPT
    this.logger.info('系统提示词已更新')
  }

  /** 手动重新启用被自动禁用的模块 */
  enableModule(moduleId: string): boolean {
    if (!this.disabledModules.has(moduleId)) return false
    this.disabledModules.delete(moduleId)
    this.consecutiveFailures.delete(moduleId)
    this.logger.info(`模块 "${moduleId}" 已手动重新启用`)
    return true
  }

  /** 获取被自动禁用的模块列表 */
  getDisabledModules(): string[] {
    return [...this.disabledModules]
  }
}
```

### 10.4 关键设计说明

#### 10.4.1 配置实时同步

`OllamaAIService` 通过 `config.onChange` 监听器实现配置热更新，无需重启服务：

```typescript
// 构造函数中注册监听
config.onChange((key, value) => {
  switch (key) {
    case 'ollama.baseUrl': this.baseUrl = value as string; break
    case 'ollama.model': this.model = value as string; break
    // ...
  }
})
```

当用户在设置面板修改 Ollama 配置时，变更通过 `ConfigManager` → `onChange` 回调实时同步到 `OllamaAIService` 实例。

#### 10.4.2 默认配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `baseUrl` | `http://localhost:11434` | Ollama 服务地址 |
| `model` | `ministral:3b` | 默认对话模型 |
| `visionModel` | `qwen2.5-vl` | 图片分析模型 |
| `embeddingModel` | `nomic-embed-text` | 嵌入向量模型 |
| `timeout` | `120000` (2分钟) | 请求超时时间 |
| `SHORT_TIMEOUT_MS` | `5000` | 健康检查超时 |

#### 10.4.3 流式输出空闲超时

`chatStream` 使用 `AbortController` + 空闲定时器机制：
- 每次收到新数据时重置定时器
- 超过 `timeout`（默认 2 分钟）没收到新数据则自动中断
- `finally` 块中清理定时器并释放 reader lock

#### 10.4.4 意图识别置信度路由

| 置信度 | 行为 |
|--------|------|
| ≥ 0.8 | 直接路由执行（先检查模块是否被禁用） |
| < 0.8 | 回退到通用对话 |

### 10.5 代码规范

- **超时保护**：所有 Ollama 请求带 `AbortSignal.timeout()`，流式输出使用空闲定时器
- **流式响应**：使用 `AsyncGenerator` 实现流式输出
- **配置热更新**：通过 `config.onChange` 监听器实时同步配置变更
- **错误处理**：Ollama 不可用时降级为文本命令模式
- **意图路由**：置信度 ≥ 0.8 直接执行，< 0.8 通用对话
- **连续失败**：同一模块连续 3 次失败自动禁用（`consecutiveFailures` Map 按模块 ID 计数，成功重置；`disabledModules` Set 管理禁用状态；提供 `enableModule()` 手动重新启用）
- **模型覆盖**：`chat()` 支持 `options.model` 覆盖默认模型

### 10.6 主进程初始化

AI 服务在主进程 `index.ts` 中初始化：

```typescript
// src/main/index.ts 中的初始化顺序
const config = new ConfigManagerImpl()
const logger = new AppLogger('main', 'info')
const eventBus = new GlobalEventBus()
const aiService = new OllamaAIService(config, logger)
// ... 后续注册 IPC handlers
registerAllIpcHandlers({ config, logger, eventBus, aiService, db, moduleManager, performanceMonitor })
```

---

> **注**：本文档反映的是 `desktop/src/main/core/` 下的实际代码实现。更复杂的调度器设计（含 `CapabilityRegistry`、`CapabilityArbiter`、确认流程等）属于扩展方案，当前实现采用简化的意图识别 + 直接路由模式。

---

## 实现状态

✅ **已实现** — 代码位于 `desktop/` 目录，与本文档描述基本一致。
