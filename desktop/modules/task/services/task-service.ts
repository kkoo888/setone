import type { DatabaseManager } from '../../../../src/main/types/database'
import type { Logger } from '../../../../src/main/types/logger'
import type { ScopedEventBus } from '../../../../src/main/types/event'
import type { Task, TaskStep } from '../types'
import { TaskStatus } from '../types'
import type { TaskRepository } from '../repositories/task-repository'
import type { TaskStepRepository } from '../repositories/task-step-repository'
import type { TaskPlanner } from '../TaskPlanner'
import type { TaskExecutor } from '../TaskExecutor'

type TaskStatusValue = typeof TaskStatus[keyof typeof TaskStatus]

export class TaskService {
  private taskRepo: TaskRepository
  private stepRepo: TaskStepRepository
  private planner: TaskPlanner
  private executor: TaskExecutor
  private logger: Logger
  private eventBus: ScopedEventBus
  private db: DatabaseManager
  private tasks = new Map<string, Task>()

  constructor(
    taskRepo: TaskRepository,
    stepRepo: TaskStepRepository,
    planner: TaskPlanner,
    executor: TaskExecutor,
    logger: Logger,
    eventBus: ScopedEventBus,
    db: DatabaseManager
  ) {
    this.taskRepo = taskRepo
    this.stepRepo = stepRepo
    this.planner = planner
    this.executor = executor
    this.logger = logger
    this.eventBus = eventBus
    this.db = db
  }

  /**
   * 从数据库加载所有任务到内存
   */
  async loadAll(): Promise<void> {
    const tasks = await this.taskRepo.findAll()
    for (const task of tasks) {
      task.steps = await this.stepRepo.findByTaskId(task.id)
      this.tasks.set(task.id, task)
    }
    this.logger.info(`已从数据库加载 ${tasks.length} 个任务`)
  }

  /**
   * 创建任务
   */
  async createTask(name: string, description: string): Promise<Task> {
    const task = await this.planner.createTask(name, description)
    this.tasks.set(task.id, task)

    await this.taskRepo.save(task)
    await this.stepRepo.saveAll(task.id, task.steps)

    return task
  }

  /**
   * 执行任务
   */
  async executeTask(taskId: string): Promise<{ error?: string } & Partial<Task>> {
    const task = this.tasks.get(taskId)
    if (!task) return { error: '任务不存在' }

    const result = await this.executor.execute(task, async (step) => {
      this.eventBus.emit('task:step', { taskId, step })
      return step.description
    })

    return result
  }

  /**
   * 列出任务摘要
   */
  listTasks(): Array<{ id: string; name: string; status: string; steps: number }> {
    return Array.from(this.tasks.values()).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      steps: t.steps.length,
    }))
  }

  /**
   * 删除任务（事务包裹）
   */
  async deleteTask(taskId: string): Promise<{ deleted: boolean }> {
    const task = this.tasks.get(taskId)
    if (!task) return { deleted: false }

    await this.db.transaction(async () => {
      await this.stepRepo.removeByTaskId(taskId)
      await this.taskRepo.removeById(taskId)
    })

    this.tasks.delete(taskId)
    this.logger.info(`任务已删除: ${task.name}`)
    return { deleted: true }
  }

  /**
   * 暂停任务
   */
  async pauseTask(taskId: string): Promise<{ error?: string; taskId?: string; status?: string }> {
    const task = this.tasks.get(taskId)
    if (!task) return { error: '任务不存在' }
    if (task.status !== (TaskStatus.EXECUTING as TaskStatusValue)) {
      return { error: `任务当前状态为 ${task.status}，无法暂停` }
    }

    this.executor.pause(taskId)
    task.status = TaskStatus.PAUSED as TaskStatusValue
    task.updatedAt = Date.now()

    await this.taskRepo.save(task)
    return { taskId, status: 'paused' }
  }

  /**
   * 获取任务进度
   */
  getTaskProgress(taskId: string): Record<string, unknown> | null {
    const task = this.tasks.get(taskId)
    if (!task) return null

    const total = task.steps.length
    const completed = task.steps.filter((s) => s.status === (TaskStatus.COMPLETED as TaskStatusValue)).length
    const failed = task.steps.filter((s) => s.status === (TaskStatus.FAILED as TaskStatusValue)).length
    const executing = task.steps.filter((s) => s.status === (TaskStatus.EXECUTING as TaskStatusValue)).length
    const pending = task.steps.filter((s) => s.status === (TaskStatus.PENDING as TaskStatusValue)).length

    return {
      taskId: task.id,
      name: task.name,
      status: task.status,
      total,
      completed,
      failed,
      executing,
      pending,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      steps: task.steps.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        error: s.error,
      })),
    }
  }

  /**
   * 持久化单个步骤（供 executor 回调使用）
   */
  async persistStep(taskId: string, step: TaskStep): Promise<void> {
    await this.stepRepo.save(taskId, step)
  }

  /**
   * 持久化任务（供 executor 回调使用）
   */
  async persistTask(task: Task): Promise<void> {
    await this.taskRepo.save(task)
  }

  /**
   * 获取内存中的任务
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId)
  }
}
