import type { DatabaseManager } from '../../../../src/main/types/database'
import type { TaskStep } from '../types'
import type { TaskStatusValue } from '../types'

/** task_steps 表行结构 */
export interface TaskStepRow {
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

export class TaskStepRepository {
  private db: DatabaseManager

  constructor(db: DatabaseManager) {
    this.db = db
  }

  async init(): Promise<void> {
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
  }

  async findByTaskId(taskId: string): Promise<TaskStep[]> {
    const rows = await this.db.query<TaskStepRow>(
      'SELECT * FROM task_steps WHERE task_id = ? ORDER BY step_order ASC',
      [taskId]
    )
    return rows.map((row) => this.toEntity(row))
  }

  async save(taskId: string, step: TaskStep, stepOrder = 0): Promise<void> {
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
        stepOrder,
      ]
    )
  }

  async saveAll(taskId: string, steps: TaskStep[]): Promise<void> {
    await this.db.transaction(async () => {
      for (let i = 0; i < steps.length; i++) {
        await this.save(taskId, steps[i], i)
      }
    })
  }

  async removeByTaskId(taskId: string): Promise<void> {
    await this.db.run(
      'DELETE FROM task_steps WHERE task_id = ?',
      [taskId]
    )
  }

  private toEntity(row: TaskStepRow): TaskStep {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status as TaskStatusValue,
      toolName: row.tool_name ?? undefined,
      result: row.result ?? undefined,
      error: row.error ?? undefined,
      dependsOn: JSON.parse(row.depends_on || '[]'),
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
    }
  }
}
