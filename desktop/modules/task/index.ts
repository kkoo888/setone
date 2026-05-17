// 补完内容：SQLite 持久化、AI 任务拆解、task_delete/pause/progress 工具、步骤状态持久化
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { DatabaseManager } from '../../src/main/types/database'
import { TaskPlanner } from './TaskPlanner'
import { TaskExecutor } from './TaskExecutor'
import type { Task, TaskStep } from './types'
import { TaskStatus } from './types'

type TaskStatusValue = typeof TaskStatus[keyof typeof TaskStatus]

/** tasks 表行结构 */
interface TaskRow {
  id: string
  name: string
  description: string
  status: string
  created_at: number
  updated_at: number
  completed_at: number | null
}

/** task_steps 表行结构 */
interface TaskStepRow {
  id: string
  task_id: string
  name: string
  description: string
  status: string
  tool_name: string | null
  params: string
  result: string | null
  error: string | null
  depends_on: string
  retry_count: number
  max_retries: number
  step_order: number
}

export default class TaskModule implements Module {
  id = 'task'
  meta!: import('../../src/main/types/module').ModuleMeta
  private planner!: TaskPlanner
  private executor!: TaskExecutor
  private tasks = new Map<string, Task>()
  private context!: ModuleContext
  private db!: DatabaseManager

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.db = context.db
    this.planner = new TaskPlanner(context.logger, context.ai)
    this.executor = new TaskExecutor(context.logger)

    // 设置步骤完成回调 — 每完成一步都持久化到数据库
    this.executor.setStepCompleteCallback(async (task, step) => {
      if (step) {
        await this.persistStep(task.id, step)
      }
      await this.persistTask(task)
    })

    // 创建数据库表
    await this.initDatabase()

    // 从数据库加载已有任务
    await this.loadTasks()

    context.logger.info('任务规划模块已激活')
  }

  async deactivate(): Promise<void> {
    this.tasks.clear()
    // 清理 DB 引用
    this.db = undefined as never
    this.context.logger.info('任务规划模块已停用')
  }

  /**
   * 初始化数据库表
   */
  private async initDatabase(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `)

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS task_steps (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        tool_name TEXT,
        params TEXT DEFAULT '{}',
        result TEXT,
        error TEXT,
        depends_on TEXT DEFAULT '[]',
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        step_order INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `)

    this.context.logger.info('任务数据库表已初始化')
  }

  /**
   * 从数据库加载所有任务
   */
  private async loadTasks(): Promise<void> {
    const rows = await this.db.query<TaskRow>('SELECT * FROM tasks ORDER BY created_at DESC')
    for (const row of rows) {
      const stepRows = await this.db.query<TaskStepRow>(
        'SELECT * FROM task_steps WHERE task_id = ? ORDER BY step_order ASC',
        [row.id]
      )
      const steps: TaskStep[] = stepRows.map((sr) => ({
        id: sr.id,
        name: sr.name,
        description: sr.description,
        status: sr.status as TaskStatusValue,
        toolName: sr.tool_name ?? undefined,
        result: sr.result ?? undefined,
        error: sr.error ?? undefined,
        dependsOn: JSON.parse(sr.depends_on || '[]'),
        retryCount: sr.retry_count,
        maxRetries: sr.max_retries,
      }))

      const task: Task = {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status as TaskStatusValue,
        steps,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at ?? undefined,
      }
      this.tasks.set(task.id, task)
    }
    this.context.logger.info(`已从数据库加载 ${rows.length} 个任务`)
  }

  /**
   * 持久化任务到数据库
   */
  private async persistTask(task: Task): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO tasks (id, name, description, status, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [task.id, task.name, task.description, task.status, task.createdAt, task.updatedAt, task.completedAt ?? null]
    )
  }

  /**
   * 持久化步骤到数据库
   */
  private async persistStep(taskId: string, step: TaskStep): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO task_steps (id, task_id, name, description, status, tool_name, params, result, error, depends_on, retry_count, max_retries, step_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        step.id,
        taskId,
        step.name,
        step.description,
        step.status,
        step.toolName ?? null,
        JSON.stringify(step.params ?? {}),
        step.result ? JSON.stringify(step.result) : null,
        step.error ?? null,
        JSON.stringify(step.dependsOn),
        step.retryCount,
        step.maxRetries,
        0,
      ]
    )
  }

  /**
   * 删除任务（包括数据库记录）
   */
  private async deleteTask(taskId: string): Promise<{ deleted: boolean }> {
    const task = this.tasks.get(taskId)
    if (!task) return { deleted: false }

    // 先删步骤，再删任务（外键约束）
    await this.db.run('DELETE FROM task_steps WHERE task_id = ?', [taskId])
    await this.db.run('DELETE FROM tasks WHERE id = ?', [taskId])
    this.tasks.delete(taskId)

    this.context.logger.info(`任务已删除: ${task.name}`)
    return { deleted: true }
  }

  /**
   * 获取任务进度
   */
  private getTaskProgress(taskId: string): Record<string, unknown> | null {
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

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'task_create', description: '创建任务', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { name, description } = p as { name: string; description: string }
            const task = await this.planner.createTask(name, description)
            this.tasks.set(task.id, task)
            await this.persistTask(task)
            for (const step of task.steps) {
              await this.persistStep(task.id, step)
            }
            return task
          },
        },
      },
      {
        type: 'tool', name: 'task_execute', description: '执行任务', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { taskId } = p as { taskId: string }
            const task = this.tasks.get(taskId)
            if (!task) return { error: '任务不存在' }
            return this.executor.execute(task, async (step) => {
              this.context.eventBus.emit('task:step', { taskId, step })
              return step.description
            })
          },
        },
      },
      {
        type: 'tool', name: 'task_list', description: '列出任务', priority: 10, moduleId: this.id,
        handler: {
          execute: async () =>
            Array.from(this.tasks.values()).map((t) => ({
              id: t.id,
              name: t.name,
              status: t.status,
              steps: t.steps.length,
            })),
        },
      },
      {
        type: 'tool', name: 'task_delete', description: '删除任务', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { taskId } = p as { taskId: string }
            return this.deleteTask(taskId)
          },
        },
      },
      {
        type: 'tool', name: 'task_pause', description: '暂停执行中的任务', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { taskId } = p as { taskId: string }
            const task = this.tasks.get(taskId)
            if (!task) return { error: '任务不存在' }
            if (task.status !== (TaskStatus.EXECUTING as TaskStatusValue)) {
              return { error: `任务当前状态为 ${task.status}，无法暂停` }
            }
            this.executor.pause(taskId)
            task.status = TaskStatus.PAUSED as TaskStatusValue
            task.updatedAt = Date.now()
            await this.persistTask(task)
            return { taskId, status: 'paused' }
          },
        },
      },
      {
        type: 'tool', name: 'task_progress', description: '获取任务执行进度', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { taskId } = p as { taskId: string }
            const progress = this.getTaskProgress(taskId)
            if (!progress) return { error: '任务不存在' }
            return progress
          },
        },
      },
    ]
  }
}
