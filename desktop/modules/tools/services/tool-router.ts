import type { Logger } from '../../../src/main/types/logger'
import type { ToolRegistry, RegisteredTool } from './tool-registry'

export interface RouteResult {
  tool: RegisteredTool
  confidence: number
}

export class ToolRouter {
  private logger: Logger
  private registry: ToolRegistry
  private confidenceThreshold: number

  constructor(logger: Logger, registry: ToolRegistry, settings?: { confidenceThreshold?: number }) {
    this.logger = logger
    this.registry = registry
    this.confidenceThreshold = settings?.confidenceThreshold ?? 0.6
  }

  /** 根据意图路由到最匹配的工具 */
  route(intent: string, context?: Record<string, unknown>): RouteResult | null {
    const tools = this.registry.getAll()
    if (tools.length === 0) return null

    const results: RouteResult[] = []
    for (const tool of tools) {
      let score = 0
      const name = tool.definition.name.toLowerCase()
      const desc = tool.definition.description.toLowerCase()
      const intentLower = intent.toLowerCase()

      if (name.includes(intentLower) || intentLower.includes(name)) score = 1
      else {
        const words = intentLower.split(/\s+/)
        const matched = words.filter((w) => desc.includes(w) || name.includes(w)).length
        score = matched / words.length
      }
      if (score >= this.confidenceThreshold) results.push({ tool, confidence: score })
    }

    results.sort((a, b) => b.confidence - a.confidence)
    if (results.length > 0) {
      this.logger.info(`工具路由: "${intent}" → ${results[0].tool.definition.name} (置信度: ${results[0].confidence.toFixed(2)})`)
      return results[0]
    }

    this.logger.warn(`工具路由失败: 未找到匹配 "${intent}" 的工具`)
    return null
  }

  /** 列出所有可用工具及其描述 */
  listTools(): Array<{ name: string; description: string; moduleId: string }> {
    return this.registry.getAll().map((t) => ({ name: t.definition.name, description: t.definition.description, moduleId: t.moduleId }))
  }
}
