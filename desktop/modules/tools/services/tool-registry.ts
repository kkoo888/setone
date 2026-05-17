import type { Logger } from '../../../src/main/types/logger'

export interface ToolDefinition {
  name: string
  description: string
  parameters?: Record<string, unknown>
  priority?: number
}

export interface RegisteredTool {
  definition: ToolDefinition
  moduleId: string
  handler: (params: Record<string, unknown>) => Promise<unknown>
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()
  private logger: Logger

  constructor(logger: Logger) { this.logger = logger }

  register(tool: RegisteredTool): void {
    const existing = this.tools.get(tool.definition.name)
    if (existing) {
      if ((tool.definition.priority ?? 0) <= (existing.definition.priority ?? 0)) {
        this.logger.warn(`工具 "${tool.definition.name}" 优先级不足，跳过注册`)
        return
      }
      this.logger.info(`工具 "${tool.definition.name}" 被模块 ${tool.moduleId} 替换（更高优先级）`)
    }
    this.tools.set(tool.definition.name, tool)
    this.logger.info(`工具已注册: ${tool.definition.name} (模块: ${tool.moduleId})`)
  }

  unregister(moduleId: string): void {
    for (const [name, tool] of this.tools) {
      if (tool.moduleId === moduleId) { this.tools.delete(name); this.logger.info(`工具已注销: ${name}`) }
    }
  }

  get(name: string): RegisteredTool | undefined { return this.tools.get(name) }
  getAll(): RegisteredTool[] { return Array.from(this.tools.values()) }
  has(name: string): boolean { return this.tools.has(name) }
}
