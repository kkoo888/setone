/**
 * 轮询注册中心
 * 统一管理所有轮询任务，供仪表盘展示
 *
 * 两类轮询：
 * 1. 核心轮询 — 主程序服务（性能监控、自动备份等），常驻，不绑定模块
 * 2. 模块轮询 — 功能模块注册，绑定 moduleId，模块 deactivate 时自动清理
 *
 * 每次变更自动推送到渲染进程（webContents.send），无需轮询
 *
 * 执行记录：
 * - tickCount：Registry 自动累加，无需模块上报
 * - lastActivity：模块在 tick/update 时顺带上报当前在做什么
 * - lastError：模块出错时上报
 */

import { BrowserWindow } from 'electron'

export interface PollingTask {
  /** 唯一标识 */
  id: string
  /** 所属模块名（展示用） */
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
  /** 绑定的模块 ID（模块轮询才有，用于自动清理） */
  moduleId?: string
  /** 累计执行次数（Registry 自动累加） */
  tickCount: number
  /** 最近一次执行活动描述 */
  lastActivity?: string
  /** 最近一次错误信息 */
  lastError?: string
  /** 额外信息 */
  meta?: Record<string, unknown>
}

export class PollingRegistry {
  private tasks = new Map<string, PollingTask>()
  private listeners: Array<(tasks: PollingTask[]) => void> = []

  // ═══ 注册 ═══

  /**
   * 注册核心轮询任务（不绑定模块，常驻）
   * 适用于：性能监控、自动备份等主程序服务
   */
  register(task: Pick<PollingTask, 'id' | 'module' | 'description' | 'intervalMs' | 'status'> & Partial<Pick<PollingTask, 'meta'>>): void {
    this.doRegister(task)
  }

  /**
   * 注册模块轮询任务（绑定 moduleId）
   * 模块 deactivate 时会自动清理，无需手动 unregister
   * 适用于：各功能模块内部的轮询任务
   */
  registerForModule(task: Pick<PollingTask, 'id' | 'module' | 'description' | 'intervalMs' | 'status'> & Partial<Pick<PollingTask, 'meta'>>, moduleId: string): void {
    this.doRegister(task, moduleId)
  }

  /** 内部注册逻辑 */
  private doRegister(task: Pick<PollingTask, 'id' | 'module' | 'description' | 'intervalMs' | 'status'> & Partial<Pick<PollingTask, 'meta'>>, moduleId?: string): void {
    const full: PollingTask = {
      ...task,
      startedAt: Date.now(),
      nextRunAt: Date.now() + task.intervalMs,
      moduleId,
      tickCount: 0,
    }
    this.tasks.set(task.id, full)
    this.notify()
  }

  // ═══ 清理 ═══

  /** 注销单个任务 */
  unregister(id: string): void {
    this.tasks.delete(id)
    this.notify()
  }

  /**
   * 注销指定模块下的所有轮询任务
   * 在模块 deactivate 时自动调用
   */
  unregisterByModule(moduleId: string): void {
    let changed = false
    for (const [id, task] of this.tasks) {
      if (task.moduleId === moduleId) {
        this.tasks.delete(id)
        changed = true
      }
    }
    if (changed) this.notify()
  }

  // ═══ 更新 ═══

  /**
   * 更新任务状态 + 可选上报活动/错误
   * 模块在执行过程中调用，顺带报告当前在做什么
   */
  update(id: string, patch: Partial<Pick<PollingTask, 'status' | 'lastRunAt' | 'nextRunAt' | 'intervalMs' | 'description' | 'lastActivity' | 'lastError'>>): void {
    const task = this.tasks.get(id)
    if (!task) return
    Object.assign(task, patch)
    if (patch.intervalMs && task.status === 'running') {
      task.nextRunAt = Date.now() + patch.intervalMs
    }
    this.notify()
  }

  /**
   * 标记执行了一次，自动累加 tickCount
   * @param activity 可选，本次执行的活动描述（如 "正在采集CPU数据"）
   */
  tick(id: string, activity?: string): void {
    const task = this.tasks.get(id)
    if (!task) return
    task.lastRunAt = Date.now()
    task.nextRunAt = Date.now() + task.intervalMs
    task.tickCount++
    if (activity) task.lastActivity = activity
    this.notify()
  }

  // ═══ 查询 ═══

  /** 获取所有任务 */
  getAll(): PollingTask[] {
    return Array.from(this.tasks.values())
  }

  /** 监听变更（主进程内部回调） */
  onChange(fn: (tasks: PollingTask[]) => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  // ═══ 推送 ═══

  /**
   * 通知渲染进程更新轮询列表
   * 每次 register / unregister / update / tick 后自动调用
   * 通过 webContents.send 推送到所有打开的窗口
   */
  private notify(): void {
    const list = this.getAll()
    // 主进程内部监听
    for (const fn of this.listeners) fn(list)
    // 推送到渲染进程
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('polling:updated', list)
      }
    }
  }
}

/** 全局单例 */
export const pollingRegistry = new PollingRegistry()
