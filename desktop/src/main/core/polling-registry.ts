/**
 * 轮询注册中心
 * 统一管理所有模块的轮询任务，供仪表盘展示
 */

export interface PollingTask {
  /** 唯一标识 */
  id: string
  /** 所属模块名 */
  module: string
  /** 轮询描述 */
  description: string
  /** 轮询间隔（毫秒） */
  intervalMs: number
  /** 状态 */
  status: 'running' | 'paused' | 'stopped'
  /** 注册时间 */
  startedAt: number
  /** 最后一次执行时间 */
  lastRunAt?: number
  /** 下次预计执行时间 */
  nextRunAt?: number
  /** 额外信息 */
  meta?: Record<string, unknown>
}

export class PollingRegistry {
  private tasks = new Map<string, PollingTask>()
  private listeners: Array<(tasks: PollingTask[]) => void> = []

  /** 注册轮询任务 */
  register(task: Omit<PollingTask, 'startedAt'>): void {
    const full: PollingTask = {
      ...task,
      startedAt: Date.now(),
      nextRunAt: Date.now() + task.intervalMs,
    }
    this.tasks.set(task.id, full)
    this.notify()
  }

  /** 注销轮询任务 */
  unregister(id: string): void {
    this.tasks.delete(id)
    this.notify()
  }

  /** 更新任务状态 */
  update(id: string, patch: Partial<Pick<PollingTask, 'status' | 'lastRunAt' | 'nextRunAt' | 'intervalMs' | 'description'>>): void {
    const task = this.tasks.get(id)
    if (!task) return
    Object.assign(task, patch)
    if (patch.intervalMs && task.status === 'running') {
      task.nextRunAt = Date.now() + patch.intervalMs
    }
    this.notify()
  }

  /** 标记执行了一次 */
  tick(id: string): void {
    const task = this.tasks.get(id)
    if (!task) return
    task.lastRunAt = Date.now()
    task.nextRunAt = Date.now() + task.intervalMs
    this.notify()
  }

  /** 获取所有任务 */
  getAll(): PollingTask[] {
    return Array.from(this.tasks.values())
  }

  /** 监听变更 */
  onChange(fn: (tasks: PollingTask[]) => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  private notify(): void {
    const list = this.getAll()
    for (const fn of this.listeners) fn(list)
  }
}

/** 全局单例 */
export const pollingRegistry = new PollingRegistry()
