import type { Logger } from '../../src/main/types/logger'
import type { Task, TaskStep } from './types'
import { TaskStatus } from './types'

type TaskStatusValue = typeof TaskStatus[keyof typeof TaskStatus]

/** 步骤完成回调（用于持久化），step 为 null 表示任务状态变更 */
type StepCompleteCallback = (task: Task, step: TaskStep | null) => void | Promise<void>

/**
 * 任务执行器 — 按依赖顺序执行步骤，支持暂停、重试和步骤持久化
 */
export class TaskExecutor {
  private logger: Logger
  /** 暂停的任务 ID 集合 */
  private pausedTasks = new Set<string>()
  /** 步骤完成回调 */
  private onStepComplete: StepCompleteCallback | null = null

  constructor(logger: Logger) {
    this.logger = logger
  }

  /**
   * 设置步骤完成回调（每完成一步都会调用，用于持久化）
   * @param callback 回调函数
   */
  setStepCompleteCallback(callback: StepCompleteCallback): void {
    this.onStepComplete = callback
  }

  /**
   * 暂停任务执行
   * @param taskId 任务 ID
   */
  pause(taskId: string): void {
    this.pausedTasks.add(taskId)
    this.logger.info(`任务已暂停: ${taskId}`)
  }

  /**
   * 恢复任务执行
   * @param taskId 任务 ID
   */
  resume(taskId: string): void {
    this.pausedTasks.delete(taskId)
    this.logger.info(`任务已恢复: ${taskId}`)
  }

  /**
   * 检查任务是否已暂停
   * @param taskId 任务 ID
   * @returns 是否已暂停
   */
  isPaused(taskId: string): boolean {
    return this.pausedTasks.has(taskId)
  }

  /**
   * 执行任务（按依赖顺序执行步骤）
   * @param task 任务对象
   * @param executeStep 步骤执行函数
   * @returns 执行完成的任务
   */
  async execute(task: Task, executeStep: (step: TaskStep) => Promise<unknown>): Promise<Task> {
    task.status = TaskStatus.EXECUTING as TaskStatusValue
    task.updatedAt = Date.now()
    this.logger.info(`开始执行任务: ${task.name} (${task.steps.length} 步)`)

    for (const step of task.steps) {
      // 检查是否被暂停
      if (this.isPaused(task.id)) {
        task.status = TaskStatus.PAUSED as TaskStatusValue
        task.updatedAt = Date.now()
        this.logger.info(`任务暂停: ${task.name}`)
        // 持久化暂停状态
        await this.notifyStepComplete(task, step)
        return task
      }

      // 检查依赖是否完成
      const deps = step.dependsOn.map((id) => task.steps.find((s) => s.id === id))
      const depsFailed = deps.some((d) => d && d.status === (TaskStatus.FAILED as TaskStatusValue))
      if (depsFailed) {
        step.status = TaskStatus.FAILED as TaskStatusValue
        step.error = '依赖步骤失败'
        await this.notifyStepComplete(task, step)
        continue
      }

      step.status = TaskStatus.EXECUTING as TaskStatusValue
      try {
        step.result = await executeStep(step)
        step.status = TaskStatus.COMPLETED as TaskStatusValue
        this.logger.info(`步骤完成: ${step.name}`)
      } catch (e) {
        step.error = e instanceof Error ? e.message : String(e)
        if (step.retryCount < step.maxRetries) {
          step.retryCount++
          this.logger.warn(`步骤重试: ${step.name} (${step.retryCount}/${step.maxRetries})`)
          try {
            step.result = await executeStep(step)
            step.status = TaskStatus.COMPLETED as TaskStatusValue
            step.error = undefined
          } catch (e2) {
            step.status = TaskStatus.FAILED as TaskStatusValue
            step.error = e2 instanceof Error ? e2.message : String(e2)
          }
        } else {
          step.status = TaskStatus.FAILED as TaskStatusValue
        }
      }

      // 每完成一步都通知（用于持久化）
      await this.notifyStepComplete(task, step)
    }

    const allDone = task.steps.every((s) => s.status === (TaskStatus.COMPLETED as TaskStatusValue))
    const anyFailed = task.steps.some((s) => s.status === (TaskStatus.FAILED as TaskStatusValue))
    task.status = allDone
      ? (TaskStatus.COMPLETED as TaskStatusValue)
      : anyFailed
        ? (TaskStatus.FAILED as TaskStatusValue)
        : (TaskStatus.PAUSED as TaskStatusValue)
    task.updatedAt = Date.now()
    if (allDone) task.completedAt = Date.now()

    // 最终状态持久化
    await this.notifyStepComplete(task, null)

    this.logger.info(`任务结束: ${task.name} → ${task.status}`)
    return task
  }

  /**
   * 通知步骤完成（调用持久化回调）
   */
  private async notifyStepComplete(task: Task, step: TaskStep | null): Promise<void> {
    if (this.onStepComplete) {
      try {
        await this.onStepComplete(task, step!)
      } catch (e) {
        this.logger.warn(`步骤持久化失败: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
}
