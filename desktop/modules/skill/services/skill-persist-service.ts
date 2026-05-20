import type { Logger } from '../../../src/main/types/logger'
import type { SkillStateEntry, SkillStats } from '../types'
import type { SkillStateRepository } from '../repositories/skill-state-repository'
import type { SkillStatsRepository } from '../repositories/skill-stats-repository'

/**
 * 技能持久化服务
 * 协调 stateRepo（JSON）+ statsRepo（SQLite），封装业务逻辑
 */
export class SkillPersistService {
  private stateRepo: SkillStateRepository
  private statsRepo: SkillStatsRepository
  private logger: Logger

  constructor(
    stateRepo: SkillStateRepository,
    statsRepo: SkillStatsRepository,
    logger: Logger
  ) {
    this.stateRepo = stateRepo
    this.statsRepo = statsRepo
    this.logger = logger
  }

  /** 初始化两个 Repository */
  async init(): Promise<void> {
    try {
      await this.stateRepo.init()
    } catch {
      // 文件不存在或解析失败，使用默认空状态（首次运行）
      this.logger.info('技能状态文件不存在，使用默认状态')
    }
    await this.statsRepo.init()
    this.logger.info('技能持久化服务已初始化')
  }

  /** 获取单个技能状态 */
  getSkillState(skillId: string): SkillStateEntry | undefined {
    return this.stateRepo.getSkillState(skillId)
  }

  /** 获取全部技能状态 */
  getAllSkillStates(): Record<string, SkillStateEntry> {
    return this.stateRepo.getAllSkillStates()
  }

  /** 设置激活/停用 */
  setActive(skillId: string, active: boolean): void {
    this.stateRepo.setActive(skillId, active)
  }

  /** 更新技能配置 */
  setConfig(skillId: string, config: Record<string, unknown>): void {
    this.stateRepo.setConfig(skillId, config)
  }

  /** 记录使用（同时更新内存统计 + SQLite） */
  async recordUsage(skillId: string, durationMs: number, success: boolean, errorMessage?: string): Promise<void> {
    this.stateRepo.touchUsage(skillId, durationMs)
    await this.statsRepo.recordUsage(skillId, durationMs, success, errorMessage)
  }

  /** 获取统计数据 */
  async getStats(skillId?: string): Promise<SkillStats[]> {
    return this.statsRepo.getStats(skillId)
  }

  /** 移到回收站 */
  async moveToTrash(skillId: string, skillPath: string): Promise<void> {
    await this.stateRepo.moveToTrash(skillId, skillPath)
  }

  /** 从回收站恢复 */
  async restoreFromTrash(skillId: string): Promise<string | null> {
    return this.stateRepo.restoreFromTrash(skillId)
  }

  /** 获取回收站内容 */
  getTrash(): Array<{ id: string; deletedAt: number; path: string }> {
    return this.stateRepo.getTrash()
  }

  /** 永久删除 */
  permanentDelete(skillId: string): boolean {
    return this.stateRepo.permanentDelete(skillId)
  }

  /** 清空回收站 */
  emptyTrash(): number {
    return this.stateRepo.emptyTrash()
  }

  /** 立即保存（关闭时调用） */
  async flush(): Promise<void> {
    await this.stateRepo.flush()
  }
}
