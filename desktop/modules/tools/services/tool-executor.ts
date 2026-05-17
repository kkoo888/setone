import type { Logger } from '../../../src/main/types/logger'
import type { RegisteredTool } from './tool-registry'

export interface ExecutionResult {
  success: boolean
  result?: unknown
  error?: string
  durationMs: number
}

export class ToolExecutor {
  private logger: Logger
  private running = new Map<string, Promise<ExecutionResult>>()
  private maxConcurrent: number

  constructor(logger: Logger, settings?: { maxConcurrentExecutions?: number }) {
    this.logger = logger
    this.maxConcurrent = settings?.maxConcurrentExecutions ?? 5
  }

  async execute(tool: RegisteredTool, params: Record<string, unknown>): Promise<ExecutionResult> {
    if (this.running.size >= this.maxConcurrent) {
      return { success: false, error: `并发执行已达上限 (${this.maxConcurrent})`, durationMs: 0 }
    }

    const startTime = Date.now()
    const execId = `${tool.definition.name}-${startTime}`
    const promise = this.doExecute(tool, params, startTime)
    this.running.set(execId, promise)

    try {
      const result = await promise
      return result
    } finally {
      this.running.delete(execId)
    }
  }

  private async doExecute(tool: RegisteredTool, params: Record<string, unknown>, startTime: number): Promise<ExecutionResult> {
    try {
      this.logger.info(`执行工具: ${tool.definition.name}`)
      const result = await tool.handler(params)
      const durationMs = Date.now() - startTime
      this.logger.info(`工具完成: ${tool.definition.name} (${durationMs}ms)`)
      return { success: true, result, durationMs }
    } catch (e) {
      const durationMs = Date.now() - startTime
      const error = e instanceof Error ? e.message : String(e)
      this.logger.error(`工具失败: ${tool.definition.name} - ${error}`)
      return { success: false, error, durationMs }
    }
  }

  getRunningCount(): number { return this.running.size }
}
