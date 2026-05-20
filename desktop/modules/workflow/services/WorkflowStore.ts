/**
 * 工作流存储层
 * 负责工作流定义和运行记录的 SQLite 持久化
 *
 * @deprecated 已拆分为 WorkflowRepository + WorkflowRunRepository + WorkflowService 分层架构。
 *             请使用新的 Repository/Service 层，此类保留仅为向后兼容。
 */
import type { DatabaseManager } from '../../../src/main/types/database'
import type { Logger } from '../../../src/main/types/logger'
import type {
  Workflow,
  WorkflowRun,
  WorkflowStep,
  StepResult,
  WorkflowRunStatus,
  WorkflowLogParams
} from '../types'

/** SQLite 中的 workflows 表行 */
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

/** SQLite 中的 workflow_runs 表行 */
interface RunRow {
  id: string
  workflow_id: string
  started_at: number
  finished_at: number | null
  status: string
  step_results_json: string
  error: string | null
}

/** @deprecated 使用 WorkflowRepository + WorkflowRunRepository + WorkflowService 替代 */
export class WorkflowStore {
  private db: DatabaseManager
  private logger: Logger

  constructor(db: DatabaseManager, logger: Logger) {
    this.db = db
    this.logger = logger
  }

  /**
   * 初始化数据库表
   */
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

    // 索引
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_runs_workflow ON workflow_runs(workflow_id)`)
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_runs_status ON workflow_runs(status)`)

    this.logger.info('工作流数据库表已初始化')
  }

  // ==================== 工作流 CRUD ====================

  async saveWorkflow(workflow: Workflow): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO workflows (id, name, description, enabled, trigger_json, steps_json, created_at, last_run_at, run_count)
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

  async getWorkflow(id: string): Promise<Workflow | undefined> {
    const row = await this.db.get<WorkflowRow>(
      'SELECT * FROM workflows WHERE id = ?',
      [id]
    )
    return row ? this.rowToWorkflow(row) : undefined
  }

  async listWorkflows(filter?: { enabled?: boolean }): Promise<Workflow[]> {
    let sql = 'SELECT * FROM workflows'
    const params: unknown[] = []

    if (filter?.enabled !== undefined) {
      sql += ' WHERE enabled = ?'
      params.push(filter.enabled ? 1 : 0)
    }

    sql += ' ORDER BY created_at DESC'

    const rows = await this.db.query<WorkflowRow>(sql, params)
    return rows.map((r) => this.rowToWorkflow(r))
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    // 先删除关联的运行记录
    await this.db.run('DELETE FROM workflow_runs WHERE workflow_id = ?', [id])
    const result = await this.db.run('DELETE FROM workflows WHERE id = ?', [id])
    return result.changes > 0
  }

  async updateWorkflowRunCount(id: string, runCount: number, lastRunAt: number): Promise<void> {
    await this.db.run(
      'UPDATE workflows SET run_count = ?, last_run_at = ? WHERE id = ?',
      [runCount, lastRunAt, id]
    )
  }

  async updateWorkflowEnabled(id: string, enabled: boolean): Promise<void> {
    await this.db.run(
      'UPDATE workflows SET enabled = ? WHERE id = ?',
      [enabled ? 1 : 0, id]
    )
  }

  // ==================== 运行记录 ====================

  async saveRun(run: WorkflowRun): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO workflow_runs (id, workflow_id, started_at, finished_at, status, step_results_json, error)
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

  async getRun(id: string): Promise<WorkflowRun | undefined> {
    const row = await this.db.get<RunRow>(
      'SELECT * FROM workflow_runs WHERE id = ?',
      [id]
    )
    return row ? this.rowToRun(row) : undefined
  }

  async getLatestRun(workflowId: string): Promise<WorkflowRun | undefined> {
    const row = await this.db.get<RunRow>(
      'SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 1',
      [workflowId]
    )
    return row ? this.rowToRun(row) : undefined
  }

  async queryRuns(params: WorkflowLogParams): Promise<WorkflowRun[]> {
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
    return rows.map((r) => this.rowToRun(r))
  }

  // ==================== 私有方法 ====================

  private rowToWorkflow(row: Record<string, unknown>): Workflow {
    const r = row as unknown as WorkflowRow
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      enabled: r.enabled === 1,
      trigger: JSON.parse(r.trigger_json),
      steps: JSON.parse(r.steps_json) as WorkflowStep[],
      createdAt: r.created_at,
      lastRunAt: r.last_run_at ?? undefined,
      runCount: r.run_count
    }
  }

  private rowToRun(row: Record<string, unknown>): WorkflowRun {
    const r = row as unknown as RunRow
    return {
      id: r.id,
      workflowId: r.workflow_id,
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? undefined,
      status: r.status as WorkflowRunStatus,
      stepResults: JSON.parse(r.step_results_json) as StepResult[],
      error: r.error ?? undefined
    }
  }
}
