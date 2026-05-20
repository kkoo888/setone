/**
 * WorkflowRepository
 * 负责 workflows 表的纯数据访问
 */
import type { DatabaseManager } from '../../../../src/main/types/database'
import type { Workflow, WorkflowStep } from '../../types'

/** SQLite workflows 表行 */
interface WorkflowRow {
  id: string
  name: string
  description: string
  enabled: number
  trigger_json: string
  steps_json: string
  created_at: number
  last_run_at: number | null
  run_count: number
}

export class WorkflowRepository {
  private db: DatabaseManager

  constructor(db: DatabaseManager) {
    this.db = db
  }

  async init(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        trigger_json TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_run_at INTEGER,
        run_count INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  async findById(id: string): Promise<Workflow | undefined> {
    const row = await this.db.get<WorkflowRow>(
      'SELECT * FROM workflows WHERE id = ?',
      [id]
    )
    return row ? this.toEntity(row) : undefined
  }

  async findAll(): Promise<Workflow[]> {
    const rows = await this.db.query<WorkflowRow>(
      'SELECT * FROM workflows ORDER BY created_at DESC'
    )
    return rows.map((r) => this.toEntity(r))
  }

  async findEnabled(): Promise<Workflow[]> {
    const rows = await this.db.query<WorkflowRow>(
      'SELECT * FROM workflows WHERE enabled = 1 ORDER BY created_at DESC'
    )
    return rows.map((r) => this.toEntity(r))
  }

  async save(workflow: Workflow): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO workflows
       (id, name, description, enabled, trigger_json, steps_json, created_at, last_run_at, run_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workflow.id,
        workflow.name,
        workflow.description,
        workflow.enabled ? 1 : 0,
        JSON.stringify(workflow.trigger),
        JSON.stringify(workflow.steps),
        workflow.createdAt,
        workflow.lastRunAt ?? null,
        workflow.runCount
      ]
    )
  }

  async removeById(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM workflows WHERE id = ?', [id])
    return result.changes > 0
  }

  async count(): Promise<number> {
    const row = await this.db.get<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM workflows'
    )
    return row?.cnt ?? 0
  }

  async updateRunInfo(id: string, lastRunAt: number): Promise<void> {
    await this.db.run(
      'UPDATE workflows SET last_run_at = ?, run_count = run_count + 1 WHERE id = ?',
      [lastRunAt, id]
    )
  }

  async updateEnabled(id: string, enabled: boolean): Promise<void> {
    await this.db.run(
      'UPDATE workflows SET enabled = ? WHERE id = ?',
      [enabled ? 1 : 0, id]
    )
  }

  private toEntity(row: WorkflowRow): Workflow {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled === 1,
      trigger: JSON.parse(row.trigger_json),
      steps: JSON.parse(row.steps_json) as WorkflowStep[],
      createdAt: row.created_at,
      lastRunAt: row.last_run_at ?? undefined,
      runCount: row.run_count
    }
  }
}
