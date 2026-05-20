/**
 * WorkflowService
 * 工作流业务逻辑层 — 协调 Repository、Engine、Scheduler
 */
import { randomUUID } from 'crypto'
import type { DatabaseManager } from '../../../src/main/types/database'
import type { Logger } from '../../../src/main/types/logger'
import type {
  Workflow,
  WorkflowRun,
  CreateWorkflowParams,
  ListWorkflowParams,
  WorkflowLogParams
} from '../types'
import { TEMPLATES } from '../types'
import { WorkflowRepository } from '../repositories/workflow-repository'
import { WorkflowRunRepository } from '../repositories/workflow-run-repository'
import type { WorkflowEngine } from './WorkflowEngine'

export class WorkflowService {
  readonly workflowRepo: WorkflowRepository
  readonly runRepo: WorkflowRunRepository
  private db: DatabaseManager
  private logger: Logger
  private engine?: WorkflowEngine

  constructor(
    workflowRepo: WorkflowRepository,
    runRepo: WorkflowRunRepository,
    db: DatabaseManager,
    logger: Logger
  ) {
    this.workflowRepo = workflowRepo
    this.runRepo = runRepo
    this.db = db
    this.logger = logger
  }

  /** 注入执行引擎（在 activate 中引擎就绪后调用） */
  setEngine(engine: WorkflowEngine): void {
    this.engine = engine
  }

  // ==================== 工作流 CRUD ====================

  async createWorkflow(params: CreateWorkflowParams): Promise<{ success: boolean; data?: Workflow; error?: string }> {
    try {
      if (!params.name?.trim()) {
        return { success: false, error: '工作流名称不能为空' }
      }
      if (!params.steps || params.steps.length === 0) {
        return { success: false, error: '至少需要一个步骤' }
      }

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

      await this.workflowRepo.save(workflow)
      this.logger.info(`工作流已创建: ${workflow.name} (${workflow.id})`)
      return { success: true, data: workflow }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  async getWorkflow(id: string): Promise<Workflow | undefined> {
    return this.workflowRepo.findById(id)
  }

  async listWorkflows(params: ListWorkflowParams): Promise<Workflow[]> {
    let workflows: Workflow[]

    if (params.enabled !== undefined) {
      workflows = params.enabled
        ? await this.workflowRepo.findEnabled()
        : (await this.workflowRepo.findAll()).filter((w) => !w.enabled)
    } else {
      workflows = await this.workflowRepo.findAll()
    }

    if (params.triggerType) {
      workflows = workflows.filter((w) => w.trigger.type === params.triggerType)
    }

    return workflows
  }

  async deleteWorkflow(workflowId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const workflow = await this.workflowRepo.findById(workflowId)
      if (!workflow) {
        return { success: false, error: `工作流 ${workflowId} 不存在` }
      }

      // 事务包裹：先删 runs 再删 workflow
      await this.db.transaction(async () => {
        await this.runRepo.removeByWorkflowId(workflowId)
        await this.workflowRepo.removeById(workflowId)
      })

      this.logger.info(`工作流已删除: ${workflow.name}`)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  async executeWorkflowById(workflowId: string, overrides?: Record<string, unknown>): Promise<{ success: boolean; data?: WorkflowRun; error?: string }> {
    try {
      const workflow = await this.workflowRepo.findById(workflowId)
      if (!workflow) {
        return { success: false, error: `工作流 ${workflowId} 不存在` }
      }
      if (!workflow.enabled) {
        return { success: false, error: `工作流 ${workflow.name} 已禁用` }
      }
      if (!this.engine) {
        return { success: false, error: '执行引擎未就绪' }
      }

      const run = await this.engine.execute(workflow, overrides)
      return { success: true, data: run }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  async pauseWorkflow(runId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.engine) {
      return { success: false, error: '执行引擎未就绪' }
    }
    const paused = this.engine.pause(runId)
    if (!paused) {
      return { success: false, error: `未找到正在运行的工作流: ${runId}` }
    }
    return { success: true }
  }

  async updateRunInfo(workflowId: string, finishedAt: number): Promise<void> {
    await this.workflowRepo.updateRunInfo(workflowId, finishedAt)
  }

  async saveRun(run: WorkflowRun): Promise<void> {
    await this.runRepo.save(run)
  }

  async getLogs(params: WorkflowLogParams): Promise<WorkflowRun[]> {
    return this.runRepo.query(params)
  }

  getTemplates() {
    return TEMPLATES
  }

  async count(): Promise<number> {
    return this.workflowRepo.count()
  }

  async createFromTemplate(templateIndex: number): Promise<{ success: boolean; data?: Workflow; error?: string }> {
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
