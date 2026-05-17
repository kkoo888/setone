import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { ToolRegistry } from './services/tool-registry'
import { ToolRouter } from './services/tool-router'
import { ToolExecutor } from './services/tool-executor'

export default class ToolsModule implements Module {
  id = 'tools'
  meta!: import('../../src/main/types/module').ModuleMeta
  private registry!: ToolRegistry
  private router!: ToolRouter
  private executor!: ToolExecutor
  private context!: ModuleContext
  private toolRegisterHandler?: (data: unknown) => void

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.registry = new ToolRegistry(context.logger)
    this.router = new ToolRouter(context.logger, this.registry, context.config?.settings)
    this.executor = new ToolExecutor(context.logger, context.config?.settings)

    // 监听其他模块注册的工具
    this.toolRegisterHandler = (data: unknown) => {
      const { tool } = data as { tool: { definition: { name: string; description: string; priority?: number }; moduleId: string; handler: (p: Record<string, unknown>) => Promise<unknown> } }
      this.registry.register(tool)
    }
    context.eventBus.on('tool:register', this.toolRegisterHandler)

    context.logger.info('工具路由模块已激活')
  }

  async deactivate(): Promise<void> {
    if (this.toolRegisterHandler) {
      this.context.eventBus.off('tool:register', this.toolRegisterHandler)
      this.toolRegisterHandler = undefined
    }
    this.context.logger.info('工具路由模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      { type: 'tool', name: 'tool_execute', description: '执行工具', priority: 10, moduleId: this.id, handler: { execute: async (p) => { const { name, params } = p as { name: string; params?: Record<string, unknown> }; const tool = this.registry.get(name); if (!tool) return { success: false, error: `工具 "${name}" 未找到` }; return this.executor.execute(tool, params ?? {}) } } },
      { type: 'tool', name: 'tool_list', description: '列出所有工具', priority: 10, moduleId: this.id, handler: { execute: async () => this.router.listTools() } },
      { type: 'tool', name: 'tool_route', description: '根据意图路由工具', priority: 10, moduleId: this.id, handler: { execute: async (p) => { const { intent } = p as { intent: string }; const result = this.router.route(intent); return result ? { name: result.tool.definition.name, confidence: result.confidence } : { name: null } } } }
    ]
  }
}
