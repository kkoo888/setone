/**
 * 工作流调度器
 * 负责：
 * - cron 定时触发
 * - 事件触发
 * - 快捷键触发
 */
import type { ModuleContext } from '../../../src/main/types/module'
import type { Logger } from '../../../src/main/types/logger'
import type { Workflow } from '../types'
import { parseCron, matchCron } from './CronParser'
import { WorkflowEngine } from './WorkflowEngine'
import { WorkflowRepository } from '../repositories/workflow-repository'

/** 调度的 cron 任务 */
interface ScheduledCron {
  workflowId: string
  cron: ReturnType<typeof parseCron>
  intervalId: ReturnType<typeof setInterval>
}

export class WorkflowScheduler {
  private context: ModuleContext
  private logger: Logger
  private workflowRepo: WorkflowRepository
  private engine: WorkflowEngine
  private cronJobs = new Map<string, ScheduledCron>()
  private eventHandlers = new Map<string, { event: string; handler: (data: unknown) => void }>()
  private hotkeyHandlers = new Map<string, (data: unknown) => void>()

  constructor(context: ModuleContext, workflowRepo: WorkflowRepository, engine: WorkflowEngine) {
    this.context = context
    this.logger = context.logger
    this.workflowRepo = workflowRepo
    this.engine = engine
  }

  /**
   * 注册工作流的触发器
   */
  async register(workflow: Workflow): Promise<void> {
    if (!workflow.enabled) return

    const { trigger } = workflow

    switch (trigger.type) {
      case 'cron':
        this.registerCron(workflow)
        break
      case 'event':
        this.registerEvent(workflow)
        break
      case 'hotkey':
        this.registerHotkey(workflow)
        break
      case 'manual':
        // 手动触发不需要注册
        break
    }
  }

  /**
   * 注销工作流的触发器
   */
  unregister(workflowId: string): void {
    // cron
    const cronJob = this.cronJobs.get(workflowId)
    if (cronJob) {
      clearInterval(cronJob.intervalId)
      this.cronJobs.delete(workflowId)
    }

    // event
    const eventEntry = this.eventHandlers.get(workflowId)
    if (eventEntry) {
      this.context.eventBus.off(eventEntry.event, eventEntry.handler as never)
      this.eventHandlers.delete(workflowId)
    }

    // hotkey
    const hotkeyHandler = this.hotkeyHandlers.get(workflowId)
    if (hotkeyHandler) {
      this.context.eventBus.off('hotkey:pressed' as never, hotkeyHandler as never)
      this.hotkeyHandlers.delete(workflowId)
    }
  }

  /**
   * 注销所有触发器
   */
  unregisterAll(): void {
    for (const id of this.cronJobs.keys()) {
      this.unregister(id)
    }
    for (const id of this.eventHandlers.keys()) {
      this.unregister(id)
    }
    for (const id of this.hotkeyHandlers.keys()) {
      this.unregister(id)
    }
  }

  /**
   * 重新加载所有启用的工作流触发器
   */
  async reloadAll(): Promise<void> {
    this.unregisterAll()

    const workflows = await this.workflowRepo.findEnabled()
    for (const workflow of workflows) {
      await this.register(workflow)
    }

    this.logger.info(`已注册 ${workflows.length} 个工作流触发器`)
  }

  /**
   * 注册 cron 触发
   * 每分钟检查一次，匹配时执行
   */
  private registerCron(workflow: Workflow): void {
    const cronExpr = workflow.trigger.cron
    if (!cronExpr) {
      this.logger.warn(`工作流 ${workflow.name} cron 表达式为空`)
      return
    }

    const parsed = parseCron(cronExpr)
    if (!parsed) {
      this.logger.warn(`工作流 ${workflow.name} cron 表达式无效: ${cronExpr}`)
      return
    }

    // 每分钟检查一次
    const intervalId = setInterval(() => {
      const now = new Date()
      if (matchCron(parsed, now)) {
        this.logger.info(`Cron 触发工作流: ${workflow.name}`)
        this.engine.execute(workflow).catch((err) => {
          this.logger.error(`Cron 触发执行失败: ${(err as Error).message}`)
        })
      }
    }, 60000)

    this.cronJobs.set(workflow.id, {
      workflowId: workflow.id,
      cron: parsed,
      intervalId
    })

    this.logger.info(`已注册 cron 触发: ${workflow.name} (${cronExpr})`)
  }

  /**
   * 注册事件触发
   */
  private registerEvent(workflow: Workflow): void {
    const eventName = workflow.trigger.event
    if (!eventName) {
      this.logger.warn(`工作流 ${workflow.name} 事件名为空`)
      return
    }

    const handler = (data: unknown): void => {
      this.logger.info(`事件 ${eventName} 触发工作流: ${workflow.name}`)
      this.engine.execute(workflow).catch((err) => {
        this.logger.error(`事件触发执行失败: ${(err as Error).message}`)
      })
    }

    this.context.eventBus.on(eventName as never, handler as never)
    this.eventHandlers.set(workflow.id, { event: eventName, handler })

    this.logger.info(`已注册事件触发: ${workflow.name} (${eventName})`)
  }

  /**
   * 注册快捷键触发
   */
  private registerHotkey(workflow: Workflow): void {
    const hotkey = workflow.trigger.hotkey
    if (!hotkey) {
      this.logger.warn(`工作流 ${workflow.name} 快捷键为空`)
      return
    }

    const handler = (data: unknown): void => {
      const eventData = data as { hotkey?: string }
      if (eventData.hotkey === hotkey) {
        this.logger.info(`快捷键 ${hotkey} 触发工作流: ${workflow.name}`)
        this.engine.execute(workflow).catch((err) => {
          this.logger.error(`快捷键触发执行失败: ${(err as Error).message}`)
        })
      }
    }

    this.context.eventBus.on('hotkey:pressed' as never, handler as never)
    this.hotkeyHandlers.set(workflow.id, handler)

    this.logger.info(`已注册快捷键触发: ${workflow.name} (${hotkey})`)
  }
}
