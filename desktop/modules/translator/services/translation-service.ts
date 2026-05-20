import type { Logger } from '../../../src/main/types/logger'
import type { TranslationRecord } from '../types'
import type { TranslationRepository } from '../repositories/translation-repository'

/**
 * 翻译历史业务服务
 * 封装翻译历史相关的业务逻辑，底层数据操作委托给 TranslationRepository
 */
export class TranslationService {
  private readonly repo: TranslationRepository
  private readonly logger: Logger

  constructor(repo: TranslationRepository, logger: Logger) {
    this.repo = repo
    this.logger = logger
  }

  /** 初始化（委托 Repository 建表） */
  async init(): Promise<void> {
    await this.repo.init()
  }

  /** 保存一条翻译记录 */
  async save(
    record: Omit<TranslationRecord, 'id' | 'createdAt' | 'isFavorite'>
  ): Promise<TranslationRecord> {
    return this.repo.save(record)
  }

  /** 获取翻译历史（分页） */
  async getHistory(limit: number = 50, offset: number = 0): Promise<TranslationRecord[]> {
    return this.repo.findAll(limit, offset)
  }

  /** 按关键词搜索翻译历史 */
  async search(keyword: string): Promise<TranslationRecord[]> {
    return this.repo.findByKeyword(keyword)
  }

  /** 按 ID 删除记录 */
  async delete(id: string): Promise<boolean> {
    return this.repo.removeById(id)
  }

  /** 切换收藏状态 */
  async toggleFavorite(id: string): Promise<boolean> {
    return this.repo.toggleFavorite(id)
  }

  /** 获取所有收藏 */
  async getFavorites(): Promise<TranslationRecord[]> {
    return this.repo.findFavorites()
  }

  /** 统计总记录数 */
  async count(): Promise<number> {
    return this.repo.count()
  }
}
