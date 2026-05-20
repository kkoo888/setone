import type { Logger } from '../../../src/main/types/logger'
import type { DatabaseManager } from '../../../src/main/types/database'
import type { SkillStats } from '../types'

/**
 * 技能统计仓库
 * 负责 SQLite skill_usage 表的读写
 */
export class SkillStatsRepository {
  private db: DatabaseManager
  private logger: Logger

  constructor(db: DatabaseManager, logger: Logger) {
    this.db = db
    this.logger = logger
  }

  /** 建表 + 索引 */
  async init(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS skill_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id TEXT NOT NULL,
        called_at INTEGER NOT NULL,
        duration_ms INTEGER,
        success INTEGER NOT NULL DEFAULT 1,
        error_message TEXT
      )
    `)
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_skill_usage_skill_id ON skill_usage(skill_id)
    `)
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_skill_usage_called_at ON skill_usage(called_at)
    `)
    this.logger.info('skill_usage 表已就绪')
  }

  /** 记录一条使用记录 */
  async recordUsage(skillId: string, durationMs: number, success: boolean, errorMessage?: string): Promise<void> {
    await this.db.run(
      'INSERT INTO skill_usage (skill_id, called_at, duration_ms, success, error_message) VALUES (?, ?, ?, ?, ?)',
      [skillId, Date.now(), durationMs, success ? 1 : 0, errorMessage ?? null]
    )
  }

  /** 统计查询（单个或全部） */
  async getStats(skillId?: string): Promise<SkillStats[]> {
    if (skillId) {
      const stat = await this.fetchSingleStats(skillId)
      return stat ? [stat] : []
    }

    const rows = await this.db.all<Array<{ skill_id: string }>>(
      'SELECT DISTINCT skill_id FROM skill_usage'
    )
    const stats: SkillStats[] = []
    for (const row of rows) {
      const stat = await this.fetchSingleStats(row.skill_id)
      if (stat) stats.push(stat)
    }
    return stats
  }

  /** 获取单个技能的统计数据 */
  private async fetchSingleStats(skillId: string): Promise<SkillStats | null> {
    const totalRow = await this.db.get<{ cnt: number; success_cnt: number; avg_dur: number }>(
      'SELECT COUNT(*) as cnt, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_cnt, AVG(duration_ms) as avg_dur FROM skill_usage WHERE skill_id = ?',
      [skillId]
    )

    const dailyRows = await this.db.all<Array<{ day: string; cnt: number }>>(
      "SELECT strftime('%Y-%m-%d', datetime(called_at / 1000, 'unixepoch')) as day, COUNT(*) as cnt FROM skill_usage WHERE skill_id = ? GROUP BY day ORDER BY day DESC LIMIT 30",
      [skillId]
    )

    const dailyUsage: Record<string, number> = {}
    for (const row of dailyRows) {
      dailyUsage[row.day] = row.cnt
    }

    const lastRow = await this.db.get<{ called_at: number }>(
      'SELECT called_at FROM skill_usage WHERE skill_id = ? ORDER BY called_at DESC LIMIT 1',
      [skillId]
    )

    return {
      skillId,
      totalCalls: totalRow?.cnt ?? 0,
      successCount: totalRow?.success_cnt ?? 0,
      failCount: (totalRow?.cnt ?? 0) - (totalRow?.success_cnt ?? 0),
      avgDuration: totalRow?.avg_dur ?? 0,
      lastUsedAt: lastRow?.called_at ?? 0,
      dailyUsage
    }
  }
}
