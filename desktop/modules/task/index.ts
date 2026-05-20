import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { TaskPlanner } from './TaskPlanner'
import { TaskExecutor } from './TaskExecutor'
import { TaskRepository } from './repositories/task-repository'
import { TaskStepRepository } from './repositories/task-step-repository'
import { TaskService } from './services/task-service'
import { TaskStatus } from './types'

type TaskStatusValue = typeof TaskStatus[keyof typeof TaskStatus]

export default class TaskModule implements Module {
  id = 'task'
  meta!: import('../../src/main/types/module').ModuleMeta
  private planner!: TaskPlanner
  private executor!: TaskExecutor
  private service!: TaskService

  async activate(context: ModuleContext): Promise<void> {
    this.planner = new TaskPlanner(context.logger, context.ai)
    this.executor = new TaskExecutor(context.logger)

    // 创建 Repository
    const taskRepo = new TaskRepository(context.db)
    const stepRepo = new TaskStepRepository(context.db)
    await taskRepo.init()
    await stepRepo.init()

    // 创建 Service
    this.service = new TaskService(
      taskRepo,
      stepRepo,
      this.planner,
      this.executor,
      context.logger,
      context.eventBus,
      context.db
    )

    // 设置步骤完成回调 — 每完成一步都持久化到数据库
    this.executor.setStepCompleteCallback(async (task, step) => {
      if (step) {
        await this.service.persistStep(task.id, step)
      }
      await this.service.persistTask(task)
    })

    // 从数据库加载已有任务
    await this.service.loadAll()

    context.logger.info('任务规划模块已激活')
  }

  async deactivate(): Promise<void> {
    this.executor = undefined as never
    this.service = undefined as never
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'task_create', description: '创建任务', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { name, description } = p as { name: string; description: string }
            return this.service.createTask(name, description)
          },
        },
      },
      {
        type: 'tool', name: 'task_execute', description: '执行任务', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { taskId } = p as { taskId: string }
            return this.service.executeTask(taskId)
          },
        },
      },
      {
        type: 'tool', name: 'task_list', description: '列出任务', priority: 10, moduleId: this.id,
        handler: {
          execute: async () => this.service.listTasks(),
        },
      },
      {
        type: 'tool', name: 'task_delete', description: '删除任务', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { taskId } = p as { taskId: string }
            return this.service.deleteTask(taskId)
          },
        },
      },
      {
        type: 'tool', name: 'task_pause', description: '暂停执行中的任务', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { taskId } = p as { taskId: string }
            return this.service.pauseTask(taskId)
          },
        },
      },
      {
        type: 'tool', name: 'task_progress', description: '获取任务执行进度', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { taskId } = p as { taskId: string }
            const progress = this.service.getTaskProgress(taskId)
            if (!progress) return { error: '任务不存在' }
            return progress
          },
        },
      },
    ]
  }
}
