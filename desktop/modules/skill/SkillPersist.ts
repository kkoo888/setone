import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { Logger } from '../../src/main/types/logger'
import type { DatabaseManager } from '../../src/main/types/database'
import type { SkillStateFile, SkillStateEntry, SkillStats } from './types'

/**
 * 技能状态持久化引擎
 * 使用 JSON 文件存储技能状态，SQLite 存储使用统计
 */
export class SkillPersist {
  private logger: Logger
  private db: DatabaseManager
  private stateFilePath: string
  private state: SkillStateFile
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(logger: Logger, db: DatabaseManager, stateFilePath: string) {
    this.logger = logger
    this.db = db
    this.stateFilePath = stateFilePath
    this.state = { skills: {}, chains: [], trash: [] }
  }

  /** 初始化持久化层（加载状态 + 创建表） */
  async init(): Promise<void> {
    await this.loadState()
    await this.ensureTables()
    this.logger.info('技能持久化层已初始化')
  }

  /** 从文件加载状态 */
  private async loadState(): Promise<void> {
    try {
      const content = await readFile(this.stateFilePath, 'utf-8')
      this.state = JSON.parse(content) as SkillStateFile
    } catch {
      // 文件不存在或解析失败，使用默认状态
      this.state = { skills: {}, chains: [], trash: [] }
    }
  }

  /** 确保 SQLite 表存在 */
  private async ensureTables(): Promise<void> {
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
  }

  /** 获取技能状态条目 */
  getSkillState(skillId: string): SkillStateEntry | undefined {
    return this.state.skills[skillId]
  }

  /** 获取全部技能状态 */
  getAllSkillStates(): Record<string, SkillStateEntry> {
    return { ...this.state.skills }
  }

  /** 设置技能状态（激活/停用） */
  setActive(skillId: string, active: boolean): void {
    if (!this.state.skills[skillId]) {
      this.state.skills[skillId] = {
        active,
        installedAt: Date.now(),
        useCount: 0,
        totalDuration: 0
      }
    } else {
      this.state.skills[skillId].active = active
    }
    this.scheduleSave()
  }

  /** 更新技能配置 */
  setConfig(skillId: string, config: Record<string, unknown>): void {
    if (!this.state.skills[skillId]) {
      this.state.skills[skillId] = {
        active: true,
        config,
        installedAt: Date.now(),
        useCount: 0,
        totalDuration: 0
      }
    } else {
      this.state.skills[skillId].config = config
    }
    this.scheduleSave()
  }

  /** 记录技能使用 */
  async recordUsage(skillId: string, durationMs: number, success: boolean, errorMessage?: string): Promise<void> {
    // 更新内存状态
    if (!this.state.skills[skillId]) {
      this.state.skills[skillId] = {
        active: true,
        installedAt: Date.now(),
        useCount: 0,
        totalDuration: 0
      }
    }

    const entry = this.state.skills[skillId]
    entry.useCount += 1
    entry.lastUsedAt = Date.now()
    entry.totalDuration += durationMs
    this.scheduleSave()

    // 写入 SQLite
    await this.db.run(
      'INSERT INTO skill_usage (skill_id, called_at, duration_ms, success, error_message) VALUES (?, ?, ?, ?, ?)',
      [skillId, Date.now(), durationMs, success ? 1 : 0, errorMessage ?? null]
    )
  }

  /** 获取技能统计数据 */
  async getStats(skillId?: string): Promise<SkillStats[]> {
    const stats: SkillStats[] = []

    if (skillId) {
      const stat = await this.fetchSingleStats(skillId)
      if (stat) stats.push(stat)
    } else {
      const ids = Object.keys(this.state.skills)
      for (const id of ids) {
        const stat = await this.fetchSingleStats(id)
        if (stat) stats.push(stat)
      }
    }

    return stats
  }

  /** 获取单个技能的统计数据 */
  private async fetchSingleStats(skillId: string): Promise<SkillStats | null> {
    const entry = this.state.skills[skillId]
    if (!entry) return null

    const totalRow = await this.db.get<{ cnt: number; success_cnt: number; avg_dur: number }>(
      'SELECT COUNT(*) as cnt, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_cnt, AVG(duration_ms) as avg_dur FROM skill_usage WHERE skill_id = ?',
      [skillId]
    )

    const dailyRows = await this.db.all<Array<{ day: string; cnt: number }>>(
      "SELECT strftime('%Y-%m-%d', datetime(called_at / 1000, 'unixepoch')) as day, COUNT(*) as cnt FROM skill_usage WHERE skill_id = ? GROUP BY day ORDER BY day DESC LIMIT 30",
      [skillId]
    ).catch(() => [])

    const dailyUsage: Record<string, number> = {}
    for (const row of dailyRows) {
      dailyUsage[row.day] = row.cnt
    }

    return {
      skillId,
      totalCalls: totalRow?.cnt ?? entry.useCount,
      successCount: totalRow?.success_cnt ?? entry.useCount,
      failCount: (totalRow?.cnt ?? 0) - (totalRow?.success_cnt ?? 0),
      avgDuration: totalRow?.avg_dur ?? entry.avgDuration ?? 0,
      lastUsedAt: entry.lastUsedAt ?? 0,
      dailyUsage
    }
  }

  /** 移到回收站 */
  async moveToTrash(skillId: string, skillPath: string): Promise<void> {
    this.state.trash.push({
      id: skillId,
      deletedAt: Date.now(),
      path: skillPath
    })
    delete this.state.skills[skillId]
    this.scheduleSave()
  }

  /** 从回收站恢复 */
  async restoreFromTrash(skillId: string): Promise<string | null> {
    const idx = this.state.trash.findIndex((t) => t.id === skillId)
    if (idx === -1) return null

    const item = this.state.trash[idx]
    this.state.trash.splice(idx, 1)
    this.state.skills[skillId] = {
      active: true,
      installedAt: Date.now(),
      useCount: 0,
      totalDuration: 0
    }
    this.scheduleSave()
    return item.path
  }

  /** 获取回收站内容 */
  getTrash(): Array<{ id: string; deletedAt: number; path: string }> {
    return [...this.state.trash]
  }

  /** 永久删除（从回收站移除记录） */
  permanentDelete(skillId: string): boolean {
    const idx = this.state.trash.findIndex((t) => t.id === skillId)
    if (idx === -1) return false
    this.state.trash.splice(idx, 1)
    this.scheduleSave()
    return true
  }

  /** 清空回收站 */
  emptyTrash(): number {
    const count = this.state.trash.length
    this.state.trash = []
    this.scheduleSave()
    return count
  }

  /** 延迟保存（防抖） */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => { void this.save() }, 500)
  }

  /** 保存状态到文件 */
  private async save(): Promise<void> {
    try {
      const dir = dirname(this.stateFilePath)
      await mkdir(dir, { recursive: true })
      await writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8')
    } catch (err) {
      this.logger.error('保存技能状态失败', err as Error)
    }
  }

  /** 立即保存（关闭时调用） */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    await this.save()
  }
}
