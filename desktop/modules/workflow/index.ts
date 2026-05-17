import { randomUUID } from 'crypto'
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type {
  Workflow,
  CreateWorkflowParams,
  ExecuteWorkflowParams,
  ListWorkflowParams,
  WorkflowLogParams
} from './types'
import { TEMPLATES } from './types'
import { WorkflowStore } from './services/WorkflowStore'
import { WorkflowEngine } from './services/WorkflowEngine'
import { WorkflowScheduler } from './services/WorkflowScheduler'

/**
 * 工作流自动化模块
 * 提供工作流的创建、执行、调度、日志等完整生命周期管理
 */
export default class WorkflowModule implements Module {
  id = 'workflow'
  meta!: import('../../src/main/types/module').ModuleMeta

  private context!: ModuleContext
  private store!: WorkflowStore
  private engine!: WorkflowEngine
  private scheduler!: WorkflowScheduler
  private cronFiredHandler?: (data: unknown) => void

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    // 初始化存储层
    this.store = new WorkflowStore(context.db, context.logger)
    await this.store.init()

    // 初始化执行引擎
    this.engine = new WorkflowEngine(context, this.store)

    // 初始化调度器
    this.scheduler = new WorkflowScheduler(context, this.store, this.engine)

    // 注册所有启用的工作流触发器
    await this.scheduler.reloadAll()

    // 注册 cron:fired 事件监听（外部 cron 系统触发）
    this.cronFiredHandler = (data: unknown) => {
      const { workflowId } = data as { workflowId?: string }
      if (workflowId) {
        this.executeWorkflowById(workflowId).catch((err) => {
          context.logger.error(`cron:fired 触发失败: ${(err as Error).message}`)
        })
      }
    }
    context.eventBus.on('cron:fired' as never, this.cronFiredHandler as never)

    context.logger.info('工作流自动化模块已激活')
  }

  async deactivate(): Promise<void> {
    // 取消 eventBus 监听
    if (this.cronFiredHandler) {
      this.context.eventBus.off('cron:fired' as never, this.cronFiredHandler as never)
      this.cronFiredHandler = undefined
    }
    this.scheduler.unregisterAll()
    this.context.logger.info('工作流自动化模块已停用')
  }

  async deactivate(): Promise<void> {
    this.scheduler.unregisterAll()
    this.context.logger.info('工作流自动化模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      // --- 创建工作流 ---
      {
        type: 'tool',
        name: 'workflow_create',
        description: '创建工作流',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const params = p as unknown as CreateWorkflowParams
            return this.createWorkflow(params)
          }
        }
      },

      // --- 执行工作流 ---
      {
        type: 'tool',
        name: 'workflow_execute',
        description: '执行工作流',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { workflowId, overrides } = p as unknown as ExecuteWorkflowParams
            return this.executeWorkflowById(workflowId, overrides)
          }
        }
      },

      // --- 列出工作流 ---
      {
        type: 'tool',
        name: 'workflow_list',
        description: '列出工作流',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const params = (p ?? {}) as ListWorkflowParams
            return this.listWorkflows(params)
          }
        }
      },

      // --- 删除工作流 ---
      {
        type: 'tool',
        name: 'workflow_delete',
        description: '删除工作流',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { workflowId } = p as { workflowId: string }
            return this.deleteWorkflow(workflowId)
          }
        }
      },

      // --- 暂停工作流 ---
      {
        type: 'tool',
        name: 'workflow_pause',
        description: '暂停执行中的工作流',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { runId } = p as { runId: string }
            return this.pauseWorkflow(runId)
          }
        }
      },

      // --- 获取执行日志 ---
      {
        type: 'tool',
        name: 'workflow_log',
        description: '获取执行日志',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const params = (p ?? {}) as WorkflowLogParams
            return this.getLogs(params)
          }
        }
      },

      // --- 获取内置模板 ---
      {
        type: 'tool',
        name: 'workflow_templates',
        description: '获取工作流模板列表',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async () => {
            return { success: true, data: TEMPLATES }
          }
        }
      },

      // --- 从模板创建工作流 ---
      {
        type: 'tool',
        name: 'workflow_create_from_template',
        description: '从模板创建工作流',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { templateIndex } = p as { templateIndex: number }
            return this.createFromTemplate(templateIndex)
          }
        }
      }
    ]
  }

  // ==================== 业务方法 ====================

  /**
   * 创建工作流
   */
  private async createWorkflow(params: CreateWorkflowParams): Promise<{ success: boolean; data?: Workflow; error?: string }> {
    try {
      // 参数校验
      if (!params.name?.trim()) {
        return { success: false, error: '工作流名称不能为空' }
      }
      if (!params.steps || params.steps.length === 0) {
        return { success: false, error: '至少需要一个步骤' }
      }

      const settings = this.context.config as Record<string, unknown>
      const maxSteps = ((settings?.settings as Record<string, unknown>)?.maxStepsPerWorkflow as number) ?? 20
      if (params.steps.length > maxSteps) {
        return { success: false, error: `步骤数量超过上限 (${maxSteps})` }
      }

      // 检查工作流总数
      const maxWorkflows = ((settings?.settings as Record<string, unknown>)?.maxWorkflows as number) ?? 50
      const existing = await this.store.listWorkflows()
      if (existing.length >= maxWorkflows) {
        return { success: false, error: `工作流数量已达上限 (${maxWorkflows})` }
      }

      // 构建工作流对象
      const workflow: Workflow = {
        id: randomUUID(),
        name: params.name.trim(),
        description: params.description ?? '',
        enabled: true,
        trigger: params.trigger,
        steps: params.steps.map((step, index) => ({
          ...step,
          id: step.id ?? randomUUID(),
          order: index + 1
        })),
        createdAt: Date.now(),
        runCount: 0
      }

      await this.store.saveWorkflow(workflow)

      // 注册触发器
      await this.scheduler.register(workflow)

      this.context.logger.info(`工作流已创建: ${workflow.name} (${workflow.id})`)

      return { success: true, data: workflow }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  /**
   * 执行工作流（通过 ID）
   */
  private async executeWorkflowById(workflowId: string, overrides?: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const workflow = await this.store.getWorkflow(workflowId)
      if (!workflow) {
        return { success: false, error: `工作流 ${workflowId} 不存在` }
      }
      if (!workflow.enabled) {
        return { success: false, error: `工作流 ${workflow.name} 已禁用` }
      }

      const run = await this.engine.execute(workflow, overrides)
      return { success: true, data: run }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  /**
   * 列出工作流
   */
  private async listWorkflows(params: ListWorkflowParams): Promise<{ success: boolean; data?: Workflow[]; error?: string }> {
    try {
      const filter: { enabled?: boolean } = {}
      if (params.enabled !== undefined) {
        filter.enabled = params.enabled
      }
      let workflows = await this.store.listWorkflows(filter.enabled !== undefined ? filter : undefined)

      // 按触发类型过滤
      if (params.triggerType) {
        workflows = workflows.filter((w) => w.trigger.type === params.triggerType)
      }

      return { success: true, data: workflows }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  /**
   * 删除工作流
   */
  private async deleteWorkflow(workflowId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const workflow = await this.store.getWorkflow(workflowId)
      if (!workflow) {
        return { success: false, error: `工作流 ${workflowId} 不存在` }
      }

      // 注销触发器
      this.scheduler.unregister(workflowId)

      // 删除数据
      await this.store.deleteWorkflow(workflowId)

      this.context.logger.info(`工作流已删除: ${workflow.name}`)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  /**
   * 暂停工作流
   */
  private pauseWorkflow(runId: string): { success: boolean; error?: string } {
    const paused = this.engine.pause(runId)
    if (!paused) {
      return { success: false, error: `未找到正在运行的工作流: ${runId}` }
    }
    return { success: true }
  }

  /**
   * 获取执行日志
   */
  private async getLogs(params: WorkflowLogParams): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const runs = await this.store.queryRuns({
        workflowId: params.workflowId,
        status: params.status,
        limit: params.limit ?? 20,
        offset: params.offset ?? 0
      })
      return { success: true, data: runs }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  /**
   * 从模板创建工作流
   */
  private async createFromTemplate(templateIndex: number): Promise<{ success: boolean; data?: Workflow; error?: string }> {
    if (templateIndex < 0 || templateIndex >= TEMPLATES.length) {
      return { success: false, error: `模板索引无效，可用范围: 0-${TEMPLATES.length - 1}` }
    }

    const template = TEMPLATES[templateIndex]
    return this.createWorkflow({
      name: template.name,
      description: template.description,
      trigger: template.trigger,
      steps: template.steps.map((step, index) => ({
        ...step,
        id: randomUUID(),
        order: index + 1,
        onError: step.onError ?? 'stop'
      }))
    })
  }
}
