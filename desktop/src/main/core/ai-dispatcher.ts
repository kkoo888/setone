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
 *
 * @author 小茜
 * @date 2026-05-15
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

      // 成功：重置失败计数
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
