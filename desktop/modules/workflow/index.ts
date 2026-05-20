import { randomUUID } from 'crypto'
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type {
  CreateWorkflowParams,
  ExecuteWorkflowParams,
  ListWorkflowParams,
  WorkflowLogParams
} from './types'
import { TEMPLATES } from './types'
import { WorkflowRepository } from './repositories/workflow-repository'
import { WorkflowRunRepository } from './repositories/workflow-run-repository'
import { WorkflowService } from './services/workflow-service'
import { WorkflowEngine } from './services/WorkflowEngine'
import { WorkflowScheduler } from './services/WorkflowScheduler'

/**
 * 工作流自动化模块
 * 提供工作流的创建、执行、调度、日志等完整生命周期管理
 *
 * 分层架构：
 * - Repository 层：纯数据访问（WorkflowRepository / WorkflowRunRepository）
 * - Service 层：业务逻辑编排（WorkflowService）
 * - Engine 层：执行引擎（WorkflowEngine）
 * - Scheduler 层：触发调度（WorkflowScheduler）
 */
export default class WorkflowModule implements Module {
  id = 'workflow'
  meta!: import('../../src/main/types/module').ModuleMeta

  private context!: ModuleContext
  private workflowRepo!: WorkflowRepository
  private runRepo!: WorkflowRunRepository
  private service!: WorkflowService
  private engine!: WorkflowEngine
  private scheduler!: WorkflowScheduler
  private cronFiredHandler?: (data: unknown) => void

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    // 1. 初始化 Repository 层
    this.workflowRepo = new WorkflowRepository(context.db)
    this.runRepo = new WorkflowRunRepository(context.db)
    await this.workflowRepo.init()
    await this.runRepo.init()

    // 2. 初始化 Service 层
    this.service = new WorkflowService(this.workflowRepo, this.runRepo, context.db, context.logger)

    // 3. 初始化执行引擎
    this.engine = new WorkflowEngine(context, this.workflowRepo, this.runRepo)
    this.service.setEngine(this.engine)

    // 4. 初始化调度器
    this.scheduler = new WorkflowScheduler(context, this.workflowRepo, this.engine)

    // 5. 注册所有启用的工作流触发器
    await this.scheduler.reloadAll()

    // 6. 注册 cron:fired 事件监听（外部 cron 系统触发）
    this.cronFiredHandler = (data: unknown) => {
      const { workflowId } = data as { workflowId?: string }
      if (workflowId) {
        this.service.executeWorkflowById(workflowId).catch((err) => {
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
            return this.service.createWorkflow(params)
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
            return this.service.executeWorkflowById(workflowId, overrides)
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
            return this.service.listWorkflows(params)
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
            return this.service.deleteWorkflow(workflowId)
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
            return this.service.pauseWorkflow(runId)
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
            return this.service.getLogs(params)
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
            return this.service.createFromTemplate(templateIndex)
          }
        }
      }
    ]
  }
}
