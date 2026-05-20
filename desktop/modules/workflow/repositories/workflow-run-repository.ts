/**
 * WorkflowRunRepository
 * 负责 workflow_runs 表的纯数据访问
 */
import type { DatabaseManager } from '../../../../src/main/types/database'
import type { WorkflowRun, WorkflowRunStatus, StepResult, WorkflowLogParams } from '../../types'

/** SQLite workflow_runs 表行 */
interface RunRow {
  id: string
  workflow_id: string
  started_at: number
  finished_at: number | null
  status: string
  step_results_json: string
  error: string | null
}

export class WorkflowRunRepository {
  private db: DatabaseManager

  constructor(db: DatabaseManager) {
    this.db = db
  }

  async init(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        status TEXT NOT NULL DEFAULT 'running',
        step_results_json TEXT NOT NULL DEFAULT '[]',
        error TEXT,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
      )
    `)
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_runs_workflow ON workflow_runs(workflow_id)`)
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_runs_status ON workflow_runs(status)`)
  }

  async findById(id: string): Promise<WorkflowRun | undefined> {
    const row = await this.db.get<RunRow>(
      'SELECT * FROM workflow_runs WHERE id = ?',
      [id]
    )
    return row ? this.toEntity(row) : undefined
  }

  async findByWorkflowId(workflowId: string, limit?: number): Promise<WorkflowRun[]> {
    let sql = 'SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC'
    const params: unknown[] = [workflowId]
    if (limit !== undefined) {
      sql += ' LIMIT ?'
      params.push(limit)
    }
    const rows = await this.db.query<RunRow>(sql, params)
    return rows.map((r) => this.toEntity(r))
  }

  async findLatest(workflowId: string): Promise<WorkflowRun | undefined> {
    const row = await this.db.get<RunRow>(
      'SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 1',
      [workflowId]
    )
    return row ? this.toEntity(row) : undefined
  }

  async query(params: WorkflowLogParams): Promise<WorkflowRun[]> {
    let sql = 'SELECT * FROM workflow_runs WHERE 1=1'
    const sqlParams: unknown[] = []

    if (params.workflowId) {
      sql += ' AND workflow_id = ?'
      sqlParams.push(params.workflowId)
    }
    if (params.status) {
      sql += ' AND status = ?'
      sqlParams.push(params.status)
    }
    sql += ' ORDER BY started_at DESC'
    if (params.limit) {
      sql += ' LIMIT ?'
      sqlParams.push(params.limit)
    }
    if (params.offset) {
      sql += ' OFFSET ?'
      sqlParams.push(params.offset)
    }

    const rows = await this.db.query<RunRow>(sql, sqlParams)
    return rows.map((r) => this.toEntity(r))
  }

  async save(run: WorkflowRun): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO workflow_runs
       (id, workflow_id, started_at, finished_at, status, step_results_json, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        run.id,
        run.workflowId,
        run.startedAt,
        run.finishedAt ?? null,
        run.status,
        JSON.stringify(run.stepResults),
        run.error ?? null
      ]
    )
  }

  async removeById(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM workflow_runs WHERE id = ?', [id])
    return result.changes > 0
  }

  async removeByWorkflowId(workflowId: string): Promise<void> {
    await this.db.run('DELETE FROM workflow_runs WHERE workflow_id = ?', [workflowId])
  }

  private toEntity(row: RunRow): WorkflowRun {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      status: row.status as WorkflowRunStatus,
      stepResults: JSON.parse(row.step_results_json) as StepResult[],
      error: row.error ?? undefined
    }
  }
}
