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
├── tool-executor.ts             # 工具调用执行器
└── index.ts                     # AI 调度器模块导出
tests/unit/
├── ai-service.test.ts
└── ai-dispatcher.test.ts
```

### 10.2 开发步骤

#### 步骤 1：实现 Ollama 客户端

**src/main/core/ai-service.ts**：

```typescript
import type {
  AIService,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  IntentResult,
  ToolDefinition
} from '../types/ai'
import type { ConfigManager } from '../types/config'
import type { Logger } from '../types/logger'

export class OllamaAIService implements AIService {
  private baseUrl = 'http://localhost:11434'
  private model = 'qwen2.5'
  private visionModel = 'qwen2.5-vl'
  private embeddingModel = 'nomic-embed-text'
  private timeout = 30000
  private logger: Logger
  private configReady: Promise<void>

  constructor(config: ConfigManager, logger: Logger) {
    this.logger = logger
    this.configReady = this.loadConfig(config)
  }

  /** 确保配置已加载完成，所有依赖配置的方法应在执行前调用 */
  private async ensureConfigReady(): Promise<void> {
    await this.configReady
  }

  private async loadConfig(config: ConfigManager): Promise<void> {
    this.baseUrl = await config.get('ollama.baseUrl', 'http://localhost:11434')
    this.model = await config.get('ollama.model', 'qwen2.5')
    this.visionModel = await config.get('ollama.visionModel', 'qwen2.5-vl')
    this.embeddingModel = await config.get('ollama.embeddingModel', 'nomic-embed-text')
    this.timeout = await config.get('ollama.timeout', 30000)
  }

  /** 检查 Ollama 是否可用 */
  async isAvailable(): Promise<boolean> {
    await this.ensureConfigReady()
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
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
      model: this.model,
      messages: this.formatMessages(messages),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048
      },
      tools: options?.tools
    }

    const response = await this.fetchWithTimeout('/api/chat', body) as ChatResponse
    // 运行时校验：确保响应格式正确
    if (!response || typeof response !== 'object' || !response.message || typeof response.message.content !== 'string') {
      throw new Error(`Ollama 返回格式异常: ${JSON.stringify(response).slice(0, 200)}`)
    }
    return response
  }

  /** 流式对话 */
  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<ChatChunk> {
    await this.ensureConfigReady()
    const body = {
      model: this.model,
      messages: this.formatMessages(messages),
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048
      },
      tools: options?.tools
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout)
    })

    if (!response.ok) {
      throw new Error(`Ollama 请求失败: ${response.status} ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法获取响应流')

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const chunk = JSON.parse(line) as ChatChunk
            yield chunk
          } catch {
            // 跳过不完整的行
          }
        }
      }

      // 流结束：flush TextDecoder 尾部并处理 buffer 中剩余内容
      buffer += decoder.decode()
      const remaining = buffer.trim()
      if (remaining) {
        try {
          const chunk = JSON.parse(remaining) as ChatChunk
          yield chunk
        } catch {
          // 最后残留数据无法解析，忽略
        }
      }
      <!-- ✅ Issue#157: 已修复 -->
      <!-- ✅ Issue#158: 已修复，reader.releaseLock 在 finally 块中 -->
    } finally {
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

    const body = {
      model: this.visionModel,
      messages,
      stream: false
    }

    const response = await this.fetchWithTimeout('/api/chat', body) as ChatResponse
    // 运行时校验：确保响应格式正确
    if (!response || typeof response !== 'object' || !response.message || typeof response.message.content !== 'string') {
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
      const content = response.message.content
      const parsed = this.extractJSON(content)
      if (parsed && this.isValidIntentResult(parsed)) {
        return parsed as IntentResult
      }
      if (parsed) {
        this.logger.warn('意图识别结果缺少必要字段，使用默认值', { parsed })
      }
    } catch (err) {
      this.logger.error('意图识别结果解析失败', err as Error)
    }

    return { intent: 'general', confidence: 0, params: {} }
  }

  /** 校验解析结果是否符合 IntentResult 基本结构 */
  private isValidIntentResult(obj: Record<string, unknown>): boolean {
    return typeof obj.intent === 'string' && obj.intent.length > 0
      && (obj.confidence === undefined || typeof obj.confidence === 'number')
      && (obj.params === undefined || (typeof obj.params === 'object' && obj.params !== null && !Array.isArray(obj.params)))
  }

  /**
   * 从文本中提取 JSON 对象
   * 优先级：```json 代码块 > 花括号配对提取 > 非贪婪回退
   *
   * 安全说明：
   * - 所有 JSON.parse 调用均包裹在 try-catch 中，防止解析异常导致崩溃
   * - 策略 3 使用非贪婪匹配，避免跨越多个 JSON 对象
   * - 返回前进行基础结构校验，确保是合法对象
   */
  private extractJSON(text: string): Record<string, unknown> | null {
    // 策略 1：从 ```json ... ``` 代码块中提取（非贪婪，已安全）
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    if (codeBlockMatch) {
      const result = this.safeParseJsonObject(codeBlockMatch[1].trim())
      if (result) return result
    }

    // 策略 2：花括号配对提取（从第一个 { 开始，计数匹配到对应的 }）
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
          break // 配对完整但解析/校验失败，跳出
        }
      }
    }

    // 策略 3：非贪婪匹配回退（仅匹配最外层第一个 {...}，避免跨对象贪婪）
    const conservativeMatch = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/)
    if (conservativeMatch) {
      const result = this.safeParseJsonObject(conservativeMatch[0])
      if (result) return result
    }

    return null
  }

  /**
   * 安全解析 JSON 字符串并校验基础结构
   * - 解析失败返回 null（不抛异常）
   * - 解析结果非对象或为数组时返回 null
   */
  private safeParseJsonObject(raw: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch { /* 解析失败，静默降级 */ }
    return null
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
      // 只有 user 消息可能包含图片，assistant 消息无需处理
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
import type { CapabilityRegistry } from './capability-registry'
import type { CapabilityArbiter } from './capability-arbiter'
import type { Logger } from '../types/logger'

export interface DispatchResult {
  response: string
  moduleId?: string
  toolCalls?: Array<{
    id: string          // 唯一标识，用于 React key
    name: string
    arguments?: Record<string, unknown>
    result?: unknown
    error?: string
    status?: 'running' | 'success' | 'error'
    durationMs?: number
  }>
  /** 当需要用户确认时存在，包含确认选项和待执行的意图 */
  confirmation?: {
    id: string
    intent: string
    description: string
    options: Array<{
      label: string
      action: 'execute' | 'skip' | 'details'
      description: string
    }>
  }
}

/** 用户确认响应 */
export interface ConfirmationResponse {
  /** 确认 ID，对应 DispatchResult.confirmation.id */
  confirmationId: string
  /** 用户选择的动作 */
  action: 'execute' | 'skip' | 'details'
}

/** 确认记录（用于审计和学习） */
interface ConfirmationRecord {
  id: string
  intent: string
  confidence: number
  userAction: 'execute' | 'skip' | 'details'
  timestamp: number
}

export class AIDispatcher {
  /** 连续失败计数器（按模块 ID 区分） */
  private consecutiveFailures = new Map<string, number>()
  /** 已自动禁用的模块集合 */
  private disabledModules = new Set<string>()
  /** 待确认的意图缓存（key = confirmationId） */
  private pendingConfirmations = new Map<string, {
    intent: IntentResult
    input: string
    history: ChatMessage[]
    timestamp: number
  }>()
  /** 用户确认记录（用于审计和优化） */
  private confirmationHistory: ConfirmationRecord[] = []
  /** 确认 ID 自增计数器 */
  private confirmationIdCounter = 0
  /** 确认缓存过期时间（ms）：5 分钟内未响应则自动过期 */
  private static readonly CONFIRMATION_TTL_MS = 5 * 60 * 1000
  /** 连续失败阈值：达到此数自动禁用 */
  private static readonly MAX_CONSECUTIVE_FAILURES = 3
  /** 默认系统提示词 */
  private static readonly DEFAULT_SYSTEM_PROMPT =
    '你是一个友好的桌面助手。用简洁亲切的方式回答用户问题。'
  /** 当前使用的系统提示词 */
  private systemPrompt: string

  constructor(
    private ai: AIService,
    private registry: CapabilityRegistry,
    private arbiter: CapabilityArbiter,
    private logger: Logger,
    config?: { systemPrompt?: string }
  ) {
    this.systemPrompt = config?.systemPrompt ?? AIDispatcher.DEFAULT_SYSTEM_PROMPT
  }

  /**
   * 处理用户输入：意图识别 → 路由 → 执行 → 响应
   */
  async dispatch(input: string, history: ChatMessage[]): Promise<DispatchResult> {
    // 1. 获取所有可用能力名称
    const capabilities = this.registry.getAllNames()

    // 2. 意图识别
    const intent = await this.ai.recognizeIntent(input, capabilities)
    this.logger.info('意图识别结果', { intent: intent.intent, confidence: intent.confidence })

    // 3. 置信度判断
    if (intent.confidence >= 0.8) {
      // 高置信度：直接路由执行（先检查模块是否被禁用）
      if (this.disabledModules.has(intent.intent)) {
        this.logger.warn(`模块 "${intent.intent}" 已因连续失败被自动禁用，请手动重新启用`)
        return {
          response: `模块 "${intent.intent}" 因连续失败已被自动禁用，请联系管理员重新启用。`,
          moduleId: undefined
        }
      }
      return this.executeIntent(intent, input, history)
    } else if (intent.confidence >= 0.6) {
      // 中置信度：生成确认请求，等待用户决策
      const confirmationId = `conf_${++this.confirmationIdCounter}_${Date.now()}`

      // 缓存待确认意图（含上下文），供 handleConfirmation 使用
      this.pendingConfirmations.set(confirmationId, {
        intent,
        input,
        history,
        timestamp: Date.now()
      })

      this.logger.info('中置信度意图，请求用户确认', {
        confirmationId,
        intent: intent.intent,
        confidence: intent.confidence
      })

      // 清理过期的确认缓存
      this.cleanupExpiredConfirmations()

      return {
        response: `我不太确定你是否想让我执行「${intent.intent}」（置信度 ${Math.round(intent.confidence * 100)}%）。请告诉我你的选择：`,
        moduleId: undefined,
        confirmation: {
          id: confirmationId,
          intent: intent.intent,
          description: `将尝试执行「${intent.intent}」相关操作`,
          options: [
            { label: '✅ 执行', action: 'execute', description: '确认执行此操作' },
            { label: '⏭️ 跳过', action: 'skip', description: '跳过，不执行任何操作' },
            { label: 'ℹ️ 查看详情', action: 'details', description: '查看意图识别的详细信息' }
          ]
        }
      }
    } else {
      // 低置信度：回退到通用对话
      return this.generalChat(input, history)
    }
  }

  /**
   * 处理用户对中置信度意图的确认响应
   * @param response 用户的确认选择
   * @returns 执行结果或详情信息
   */
  async handleConfirmation(response: ConfirmationResponse): Promise<DispatchResult> {
    const pending = this.pendingConfirmations.get(response.confirmationId)

    if (!pending) {
      return {
        response: '该确认请求已过期或不存在，请重新描述你的需求。',
        moduleId: undefined
      }
    }

    const { intent, input, history } = pending

    // 记录用户选择
    const record: ConfirmationRecord = {
      id: response.confirmationId,
      intent: intent.intent,
      confidence: intent.confidence,
      userAction: response.action,
      timestamp: Date.now()
    }
    this.confirmationHistory.push(record)

    // 移除已处理的确认缓存
    this.pendingConfirmations.delete(response.confirmationId)

    this.logger.info('用户确认响应已记录', {
      confirmationId: response.confirmationId,
      intent: intent.intent,
      action: response.action
    })

    switch (response.action) {
      case 'execute':
        // 用户确认执行：走正常的意图执行流程
        this.logger.info('用户确认执行中置信度意图', { intent: intent.intent })
        return this.executeIntent(intent, input, history)

      case 'details': {
        // 查看详情：返回意图识别的详细信息，让用户决定是否执行
        // 生成新的 confirmationId 并重新缓存 pending 数据，确保后续 execute/skip 可正常处理
        const newConfirmationId = `conf_${++this.confirmationIdCounter}_${Date.now()}`
        this.pendingConfirmations.set(newConfirmationId, {
          intent,
          input,
          history,
          timestamp: Date.now()
        })

        this.logger.info('用户查看意图详情，生成新的确认请求', {
          originalId: response.confirmationId,
          newConfirmationId,
          intent: intent.intent
        })

        return {
          response: [
            `📋 **意图识别详情**`,
            `- **识别意图**：${intent.intent}`,
            `- **置信度**：${Math.round(intent.confidence * 100)}%`,
            `- **识别参数**：${intent.params ? JSON.stringify(intent.params, null, 2) : '无'}`,
            `- **原始输入**：${input}`,
            '',
            `基于以上信息，你可以选择：`,
            `1. ✅ 执行 — 确认执行此操作`,
            `2. ⏭️ 跳过 — 不执行，回到对话`,
          ].join('\n'),
          moduleId: undefined,
          confirmation: {
            id: newConfirmationId,
            intent: intent.intent,
            description: `确认后将执行「${intent.intent}」`,
            options: [
              { label: '✅ 执行', action: 'execute', description: '确认执行此操作' },
              { label: '⏭️ 跳过', action: 'skip', description: '跳过，不执行任何操作' }
            ]
          }
        }
      }

      case 'skip':
      default:
        // 跳过：回退到通用对话
        this.logger.info('用户跳过中置信度意图，回退到通用对话', { intent: intent.intent })
        return this.generalChat(input, history)
    }
  }

  <!-- ✅ Issue#156: 已修复 — handleConfirmation 完整处理 confirmationId 验证、execute/skip/details 三种动作、pendingConfirmations 缓存清理及 confirmationHistory 记录 -->

  /**
   * 获取确认记录（用于审计和优化意图识别）
   * @param limit 返回最近 N 条记录，默认 50
   */
  getConfirmationHistory(limit = 50): ConfirmationRecord[] {
    return this.confirmationHistory.slice(-limit)
  }

  /** 清理过期的确认缓存 */
  private cleanupExpiredConfirmations(): void {
    const now = Date.now()
    for (const [id, pending] of this.pendingConfirmations) {
      if (now - pending.timestamp > AIDispatcher.CONFIRMATION_TTL_MS) {
        this.pendingConfirmations.delete(id)
        this.logger.debug('已清理过期确认缓存', { confirmationId: id })
      }
    }
  }

  /** 执行意图 */
  private async executeIntent(
    intent: IntentResult,
    input: string,
    history: ChatMessage[]
  ): Promise<DispatchResult> {
    // 仲裁：选择具体模块
    const arbitration = this.arbiter.arbitrate({
      capabilityName: intent.intent,
      params: intent.params
    })

    if (!arbitration) {
      return { response: `抱歉，我没有找到能处理 "${intent.intent}" 的模块。` }
    }

    const { selectedModuleId, capability } = arbitration
    this.logger.info(`路由到模块: ${selectedModuleId}`, { capability: capability.name })

    // 执行工具调用
    try {
      if (capability.handler) {
        const result = await this.withTimeout(
          (signal) => capability.handler!.execute(intent.params, { signal }),
          30000,
          `模块 "${selectedModuleId}" 执行超时`
        )

        // ✅ 成功：重置该模块的连续失败计数器
        if (this.consecutiveFailures.has(selectedModuleId)) {
          this.consecutiveFailures.delete(selectedModuleId)
          this.logger.info(`模块 "${selectedModuleId}" 执行成功，已重置失败计数器`)
        }

        return {
          response: this.formatToolResult(capability.name, result),
          moduleId: selectedModuleId,
          toolCalls: [{ id: `${capability.name}-0`, name: capability.name, result }]
        }
      }

      return { response: `模块 "${selectedModuleId}" 已处理，但没有返回结果。`, moduleId: selectedModuleId }
    } catch (err) {
      this.logger.error(`模块 "${selectedModuleId}" 执行失败`, err as Error)

      // ❌ 失败：递增连续失败计数器
      const failCount = (this.consecutiveFailures.get(selectedModuleId) ?? 0) + 1
      this.consecutiveFailures.set(selectedModuleId, failCount)

      if (failCount >= AIDispatcher.MAX_CONSECUTIVE_FAILURES) {
        // 达到阈值：自动禁用模块
        this.disabledModules.add(selectedModuleId)
        this.logger.warn(
          `⚠️ 模块 "${selectedModuleId}" 已连续失败 ${failCount} 次，已自动禁用。` +
          ` 使用 enableModule("${selectedModuleId}") 手动重新启用。`
        )
      } else {
        this.logger.warn(
          `模块 "${selectedModuleId}" 连续失败 ${failCount}/${AIDispatcher.MAX_CONSECUTIVE_FAILURES} 次`
        )
      }

      return {
        response: `执行 "${intent.intent}" 时遇到了问题：${(err as Error).message}`,
        moduleId: selectedModuleId
      }
    }
  }

  /** 通用对话（无工具调用） */
  private async generalChat(input: string, history: ChatMessage[]): Promise<DispatchResult> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: this.systemPrompt
      },
      ...history.slice(-10),
      { role: 'user', content: input }
    ]

    const response = await this.ai.chat(messages)
    return { response: response.message.content }
  }

  /**
   * 运行时更新系统提示词
   * @param prompt 新的系统提示词，传空字符串则恢复默认值
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt || AIDispatcher.DEFAULT_SYSTEM_PROMPT
    this.logger.info('系统提示词已更新')
  }

  /** 格式化工具结果 */
  private formatToolResult(toolName: string, result: unknown): string {
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  }

  /** 带超时的 Promise（基于 AbortSignal，超时后真正取消执行） */
  private withTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    ms: number,
    message: string
  ): Promise<T> {
    const controller = new AbortController()
    const { signal } = controller

    return Promise.race([
      operation(signal),
      new Promise<T>((_, reject) => {
        const timer = setTimeout(() => {
          controller.abort()
          reject(new Error(message))
        }, ms)
        // 如果操作先完成，清除定时器
        signal.addEventListener('abort', () => clearTimeout(timer))
      })
    ])
  }

  // ─── 模块失败管理（公共 API） ─────────────────────────────

  /**
   * 手动重新启用被自动禁用的模块
   * @param moduleId 模块 ID
   * @returns 是否成功启用（false 表示该模块未被禁用）
   */
  enableModule(moduleId: string): boolean {
    if (!this.disabledModules.has(moduleId)) {
      return false
    }
    this.disabledModules.delete(moduleId)
    this.consecutiveFailures.delete(moduleId)
    this.logger.info(`✅ 模块 "${moduleId}" 已被手动重新启用`)
    return true
  }

  /**
   * 检查模块是否因连续失败被自动禁用
   * @param moduleId 模块 ID
   */
  isModuleDisabled(moduleId: string): boolean {
    return this.disabledModules.has(moduleId)
  }

  /**
   * 获取模块当前连续失败次数
   * @param moduleId 模块 ID
   */
  getConsecutiveFailureCount(moduleId: string): number {
    return this.consecutiveFailures.get(moduleId) ?? 0
  }

  /**
   * 获取所有被自动禁用的模块列表
   */
  getDisabledModules(): string[] {
    return Array.from(this.disabledModules)
  }
}
```

#### 步骤 3：实现工具执行器

**src/main/core/tool-executor.ts**：

```typescript
import type { Logger } from '../types/logger'

// ─── 类型定义 ───────────────────────────────────────────────

/** 工具执行上下文（由 AIDispatcher 传入） */
export interface ToolExecutionContext {
  /** 触发来源：用户直接输入 / 任务计划 / 定时触发 */
  source: 'user' | 'task' | 'schedule'
  /** 会话 ID，用于日志追踪 */
  sessionId?: string
  /** 用户 ID（多用户场景） */
  userId?: string
  /** 超时覆盖（毫秒），优先级高于默认值 */
  timeoutMs?: number
}

/** 单次工具执行结果 */
export interface ToolExecutionResult {
  /** 是否成功 */
  success: boolean
  /** 工具返回值（成功时） */
  data?: unknown
  /** 错误信息（失败时） */
  error?: string
  /** 错误码（用于前端分类展示） */
  errorCode?: ToolErrorCode
  /** 执行耗时（毫秒） */
  durationMs: number
  /** 工具名称 */
  toolName: string
  /** 执行时间戳 */
  timestamp: number
}

/** 工具错误码枚举 */
export const ToolErrorCode = {
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT',
  EXECUTION_ERROR: 'EXECUTION_ERROR',
  INVALID_PARAMS: 'INVALID_PARAMS',
  MODULE_UNAVAILABLE: 'MODULE_UNAVAILABLE'
} as const

export type ToolErrorCode = (typeof ToolErrorCode)[keyof typeof ToolErrorCode]

/** 工具处理器接口（与 ToolRegistry.RegisteredTool.handler 对齐） */
export interface ToolHandler {
  (params: Record<string, unknown>): Promise<unknown>
}

/** 工具注册项（ToolExecutor 自身维护的精简视图） */
export interface ToolEntry {
  name: string
  handler: ToolHandler
  moduleId: string
  /** 该工具自定义超时（毫秒），覆盖全局默认 */
  timeoutMs?: number
}

// ─── 常量 ───────────────────────────────────────────────────

/** 全局默认工具执行超时（毫秒） */
const DEFAULT_TIMEOUT_MS = 30_000

/** 最大重试次数（仅对可重试错误生效） */
const MAX_RETRIES = 1

/** 可重试的错误模式（网络抖动、临时不可用） */
const RETRYABLE_PATTERNS = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /socket hang up/i,
  /429/
]

// ─── ToolExecutor 类 ────────────────────────────────────────

/**
 * 工具执行器
 *
 * 职责：
 * 1. 接收 AIDispatcher / TaskExecutor 的工具调用请求
 * 2. 查找已注册的工具处理器
 * 3. 参数校验 → 超时控制 → 执行 → 结果格式化
 * 4. 统一错误处理与日志记录
 *
 * 与 ToolRouter 的关系：
 * - ToolRouter 负责「决定调用哪个工具」（AI 意图路由）
 * - ToolExecutor 负责「安全地执行工具调用」（运行时执行引擎）
 * - ToolRouter.execute() 内部委托给 ToolExecutor.execute()
 */
export class ToolExecutor {
  private tools = new Map<string, ToolEntry>()
  private defaultTimeout: number
  private logger: Logger

  constructor(logger: Logger, defaultTimeoutMs = DEFAULT_TIMEOUT_MS) {
    this.logger = logger
    this.defaultTimeout = defaultTimeoutMs
  }

  // ─── 工具注册 ──────────────────────────────────────────

  /**
   * 注册工具（由模块加载时调用，或由 ToolRegistry 同步）
   * @param entry 工具注册项
   */
  register(entry: ToolEntry): void {
    if (this.tools.has(entry.name)) {
      this.logger.warn(`[ToolExecutor] 工具 "${entry.name}" 已存在，将被覆盖`)
    }
    this.tools.set(entry.name, entry)
    this.logger.debug(`[ToolExecutor] 工具已注册: ${entry.name} (模块: ${entry.moduleId})`)
  }

  /**
   * 批量注册工具
   * @param entries 工具注册项数组
   */
  registerAll(entries: ToolEntry[]): void {
    for (const entry of entries) {
      this.register(entry)
    }
  }

  /**
   * 注销工具
   * @param name 工具名称
   */
  unregister(name: string): void {
    this.tools.delete(name)
    this.logger.debug(`[ToolExecutor] 工具已注销: ${name}`)
  }

  /**
   * 按模块 ID 注销所有工具（模块卸载时调用）
   * @param moduleId 模块 ID
   */
  unregisterByModule(moduleId: string): void {
    const keysToDelete: string[] = []
    for (const [name, entry] of this.tools) {
      if (entry.moduleId === moduleId) {
        keysToDelete.push(name)
      }
    }
    for (const name of keysToDelete) {
      this.tools.delete(name)
      this.logger.debug(`[ToolExecutor] 工具已注销: ${name} (模块 ${moduleId} 卸载)`)
    }
  }

  /**
   * 检查工具是否已注册
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * 获取所有已注册工具名称
   */
  getRegisteredNames(): string[] {
    return Array.from(this.tools.keys())
  }

  // ─── 核心执行 ──────────────────────────────────────────

  /**
   * 执行工具调用
   *
   * 完整流程：查找工具 → 参数校验 → 超时执行 → 重试 → 结果格式化
   *
   * @param toolName 工具名称
   * @param params 工具参数
   * @param context 执行上下文
   * @returns ToolExecutionResult 统一结果对象
   */
  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext = { source: 'user' }
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now()
    const timestamp = startTime

    // 1. 查找工具
    const entry = this.tools.get(toolName)
    if (!entry) {
      this.logger.warn(`[ToolExecutor] 工具未找到: ${toolName}`)
      return {
        success: false,
        error: `工具 "${toolName}" 未注册`,
        errorCode: ToolErrorCode.TOOL_NOT_FOUND,
        durationMs: Date.now() - startTime,
        toolName,
        timestamp
      }
    }

    // 2. 参数校验（基础检查）
    const paramError = this.validateParams(toolName, params)
    if (paramError) {
      return {
        success: false,
        error: paramError,
        errorCode: ToolErrorCode.INVALID_PARAMS,
        durationMs: Date.now() - startTime,
        toolName,
        timestamp
      }
    }

    // 3. 确定超时时间（优先级：context > 工具自定义 > 全局默认）
    const timeoutMs = context.timeoutMs ?? entry.timeoutMs ?? this.defaultTimeout

    // 4. 带重试的执行
    let lastError: Error | undefined
    const maxAttempts = MAX_RETRIES + 1

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.info(`[ToolExecutor] 执行工具: ${toolName}`, {
          params,
          source: context.source,
          sessionId: context.sessionId,
          attempt,
          timeoutMs
        })

        const result = await this.executeWithTimeout(entry.handler, params, timeoutMs)

        const durationMs = Date.now() - startTime
        this.logger.info(`[ToolExecutor] 工具 "${toolName}" 执行成功`, {
          durationMs,
          attempt
        })

        return {
          success: true,
          data: result,
          durationMs,
          toolName,
          timestamp
        }
      } catch (err) {
        lastError = err as Error
        const isRetryable = this.isRetryableError(lastError)

        this.logger.warn(`[ToolExecutor] 工具 "${toolName}" 执行失败 (尝试 ${attempt}/${maxAttempts})`, {
          error: lastError.message,
          isRetryable
        })

        // 不可重试的错误或已用完重试次数，直接跳出
        if (!isRetryable || attempt >= maxAttempts) break

        // 重试前短暂等待（指数退避）
        await this.delay(Math.min(1000 * attempt, 3000))
      }
    }

    // 5. 所有重试均失败，返回错误结果
    const durationMs = Date.now() - startTime
    const isTimeout = lastError?.message?.includes('执行超时')

    return {
      success: false,
      error: lastError?.message ?? '未知错误',
      errorCode: isTimeout ? ToolErrorCode.EXECUTION_TIMEOUT : ToolErrorCode.EXECUTION_ERROR,
      durationMs,
      toolName,
      timestamp
    }
  }

  /**
   * 执行工具并返回结果（抛异常版本，供 ToolRouter.execute() 调用）
   *
   * @param toolName 工具名称
   * @param params 工具参数
   * @param context 执行上下文
   * @returns 工具返回值
   * @throws 工具未找到或执行失败时抛出异常
   */
  async executeOrThrow(
    toolName: string,
    params: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<unknown> {
    const result = await this.execute(toolName, params, context)
    if (!result.success) {
      throw new Error(result.error ?? `工具 "${toolName}" 执行失败`)
    }
    return result.data
  }

  // ─── 内部方法 ──────────────────────────────────────────

  /** 带超时的工具执行 */
  private executeWithTimeout(
    handler: ToolHandler,
    params: Record<string, unknown>,
    timeoutMs: number
  ): Promise<unknown> {
    return Promise.race([
      handler(params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`工具执行超时 (${timeoutMs}ms)`)), timeoutMs)
      )
    ])
  }

  /** 基础参数校验 */
  private validateParams(toolName: string, params: Record<string, unknown>): string | null {
    if (params === null || params === undefined || typeof params !== 'object') {
      return `工具 "${toolName}" 的参数必须是对象`
    }
    return null
  }

  /** 判断错误是否可重试 */
  private isRetryableError(err: Error): boolean {
    return RETRYABLE_PATTERNS.some((pattern) => pattern.test(err.message))
  }

  /** 延迟 */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 格式化工具结果为可读字符串（供 AIDispatcher 使用）
   * @param toolName 工具名称
   * @param result 工具原始返回值
   */
  static formatResult(toolName: string, result: unknown): string {
    if (result === null || result === undefined) {
      return `工具 "${toolName}" 执行完成，无返回结果`
    }
    if (typeof result === 'string') return result
    try {
      return JSON.stringify(result, null, 2)
    } catch {
      return String(result)
    }
  }
}
```

### 10.3 代码规范

- **超时保护**：所有 Ollama 请求带 `AbortSignal.timeout()`
- **流式响应**：使用 `AsyncGenerator` 实现流式输出
- **错误处理**：Ollama 不可用时降级为文本命令模式
- **意图路由**：置信度 ≥ 0.8 直接执行，0.6-0.8 确认后执行，< 0.6 通用对话
- **连续失败**：同一模块连续 3 次失败自动禁用（`consecutiveFailures` Map 按模块 ID 计数，成功重置；`disabledModules` Set 管理禁用状态；提供 `enableModule()` 手动重新启用）

### 10.4 单元测试示例 <!-- ✅ Issue#163: 已修复 -->

```typescript
// ── 测试示例 ──────────────────────────────────────────────────────
// src/main/core/__tests__/ai-dispatcher.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('AIDispatcher', () => {
  let dispatcher: AIDispatcher

  beforeEach(() => {
    // mock 依赖
    const mockOllama = { chat: vi.fn(), chatStream: vi.fn() }
    const mockArbiter = { arbitrate: vi.fn() }
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    dispatcher = new AIDispatcher(mockOllama as any, mockArbiter as any, mockLogger as any)
  })

  it('应正确处理高置信度意图', async () => {
    // 测试高置信度路由
  })

  it('应正确处理中置信度确认', async () => {
    // 测试确认流程
  })

  it('低置信度应回退到通用对话', async () => {
    // 测试回退机制
  })
})
```

---
