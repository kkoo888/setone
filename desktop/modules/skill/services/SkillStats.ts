import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { Logger } from '../../../src/main/types/logger'

/** 使用记录 */
export interface SkillUsageRecord {
  skillId: string
  timestamp: number
  duration: number
  success: boolean
  errorMessage?: string
}

/** 技能统计数据 */
export interface SkillStatsData {
  skillId: string
  totalCalls: number
  successCount: number
  failureCount: number
  lastUsedAt: number | null
  avgDuration: number
  recentRecords: SkillUsageRecord[]
}

/** 统计数据文件结构 */
interface StatsFile {
  records: SkillUsageRecord[]
}

/** 保留天数 */
const RETENTION_DAYS = 30
const MAX_RECENT_RECORDS = 10

/**
 * 技能使用统计服务
 * 记录每个技能的使用次数、最后使用时间、成功率等
 * 数据持久化到 JSON 文件
 */
export class SkillStats {
  private records: SkillUsageRecord[] = []
  private filePath: string
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  /** 清理定时器（模块停用时调用） */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
  }

  constructor(
    private logger: Logger,
    private skillsDir: string
  ) {
    this.filePath = `${skillsDir}/.stats.json`
  }

  /** 初始化：从文件加载统计数据 */
  async init(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8')
      const data = JSON.parse(content) as StatsFile
      this.records = data.records ?? []
      this.logger.info(`已加载 ${this.records.length} 条使用记录`)
    } catch {
      this.records = []
    }
  }

  /** 记录一次使用 */
  async record(
    skillId: string,
    duration: number,
    success: boolean,
    error?: string
  ): Promise<void> {
    const record: SkillUsageRecord = {
      skillId,
      timestamp: Date.now(),
      duration,
      success,
      errorMessage: error
    }
    this.records.push(record)
    await this.save()
    this.logger.debug(`记录使用: ${skillId}, 耗时 ${duration}ms, ${success ? '成功' : '失败'}`)
  }

  /** 获取统计数据 */
  getStats(skillId?: string): SkillStatsData[] {
    const grouped = new Map<string, SkillUsageRecord[]>()

    for (const record of this.records) {
      if (skillId && record.skillId !== skillId) continue
      if (!grouped.has(record.skillId)) {
        grouped.set(record.skillId, [])
      }
      grouped.get(record.skillId)!.push(record)
    }

    const stats: SkillStatsData[] = []

    for (const [id, records] of grouped) {
      const successCount = records.filter((r) => r.success).length
      const totalDuration = records.reduce((sum, r) => sum + r.duration, 0)
      const sorted = [...records].sort((a, b) => b.timestamp - a.timestamp)

      stats.push({
        skillId: id,
        totalCalls: records.length,
        successCount,
        failureCount: records.length - successCount,
        lastUsedAt: sorted[0]?.timestamp ?? null,
        avgDuration: records.length > 0 ? Math.round(totalDuration / records.length) : 0,
        recentRecords: sorted.slice(0, MAX_RECENT_RECORDS)
      })
    }

    // 按使用次数降序排序
    stats.sort((a, b) => b.totalCalls - a.totalCalls)
    return stats
  }

  /** 获取概览统计 */
  getOverview(): {
    totalCalls: number
    successRate: number
    avgDuration: number
    activeSkillCount: number
  } {
    if (this.records.length === 0) {
      return { totalCalls: 0, successRate: 0, avgDuration: 0, activeSkillCount: 0 }
    }

    const successCount = this.records.filter((r) => r.success).length
    const totalDuration = this.records.reduce((sum, r) => sum + r.duration, 0)
    const uniqueSkills = new Set(this.records.map((r) => r.skillId))

    return {
      totalCalls: this.records.length,
      successRate: Math.round((successCount / this.records.length) * 100),
      avgDuration: Math.round(totalDuration / this.records.length),
      activeSkillCount: uniqueSkills.size
    }
  }

  /** 获取最近的使用记录 */
  getRecentRecords(limit = 20): SkillUsageRecord[] {
    return [...this.records]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /** 清除旧记录（保留最近 N 天） */
  async cleanup(): Promise<number> {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    const before = this.records.length
    this.records = this.records.filter((r) => r.timestamp >= cutoff)
    const removed = before - this.records.length

    if (removed > 0) {
      await this.save()
      this.logger.info(`清理了 ${removed} 条过期使用记录`)
    }

    return removed
  }

  /** 保存到文件 */
  private async save(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => { void this.doSave() }, 300)
  }

  private async doSave(): Promise<void> {
    try {
      const dir = dirname(this.filePath)
      await mkdir(dir, { recursive: true })
      const data: StatsFile = { records: this.records }
      await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      this.logger.error('保存统计数据失败', err as Error)
    }
  }
}
