import type { DatabaseManager } from '../../../../src/main/types/database'
import type { Task } from '../types'
import type { TaskStatusValue } from '../types'

/** tasks 表行结构 */
export interface TaskRow {
  id: string
  name: string
  description: string
  status: string
  created_at: number
  updated_at: number
  completed_at: number | null
}

export class TaskRepository {
  private db: DatabaseManager

  constructor(db: DatabaseManager) {
    this.db = db
  }

  async init(): Promise<void> {
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
  }

  async findById(id: string): Promise<Task | undefined> {
    const rows = await this.db.query<TaskRow>(
      'SELECT * FROM tasks WHERE id = ?',
      [id]
    )
    return rows.length > 0 ? this.toEntity(rows[0]) : undefined
  }

  async findAll(): Promise<Task[]> {
    const rows = await this.db.query<TaskRow>(
      'SELECT * FROM tasks ORDER BY created_at DESC'
    )
    return rows.map((row) => this.toEntity(row))
  }

  async save(task: Task): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO tasks (id, name, description, status, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [task.id, task.name, task.description, task.status, task.createdAt, task.updatedAt, task.completedAt ?? null]
    )
  }

  async removeById(id: string): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM tasks WHERE id = ?',
      [id]
    )
    return (result.changes ?? 0) > 0
  }

  async count(): Promise<number> {
    const rows = await this.db.query<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM tasks'
    )
    return rows[0]?.cnt ?? 0
  }

  private toEntity(row: TaskRow): Task {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status as TaskStatusValue,
      steps: [], // 步骤由 TaskStepRepository 单独加载
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at ?? undefined,
    }
  }
}
