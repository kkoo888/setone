import { randomUUID } from 'crypto'
import type { DatabaseManager } from '../../../src/main/types/database'
import type { Logger } from '../../../src/main/types/logger'
import type { TranslationRecord } from '../types'

/** SQLite 行类型 */
interface HistoryRow {
  id: string
  source_text: string
  translated_text: string
  source_lang: string
  target_lang: string
  is_favorite: number
  created_at: number
}

/**
 * 翻译历史存储服务
 * 使用 SQLite 管理翻译记录和收藏
 *
 * @deprecated 此类已拆分为 TranslationRepository（数据访问）+ TranslationService（业务逻辑）。
 * 请使用 TranslationService 替代。此类将在后续版本移除。
 */
export class TranslationHistory {
  private readonly db: DatabaseManager
  private readonly logger: Logger
  private readonly maxHistory: number

  constructor(db: DatabaseManager, logger: Logger, maxHistory: number = 200) {
    this.db = db
    this.logger = logger
    this.maxHistory = maxHistory
  }

  /**
   * 初始化数据库表
   */
  async init(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS translation_history (
        id TEXT PRIMARY KEY,
        source_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `)

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_translation_history_created_at ON translation_history(created_at DESC)
    `)

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_translation_history_favorite ON translation_history(is_favorite) WHERE is_favorite = 1
    `)

    this.logger.info('翻译历史数据库表已初始化')
  }

  /**
   * 保存翻译记录
   */
  async save(record: Omit<TranslationRecord, 'id' | 'createdAt' | 'isFavorite'>): Promise<TranslationRecord> {
    const id = randomUUID()
    const now = Date.now()

    await this.db.run(
      `INSERT INTO translation_history (id, source_text, translated_text, source_lang, target_lang, is_favorite, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [id, record.sourceText, record.translatedText, record.sourceLang, record.targetLang, now]
    )

    // 超过上限时清理旧记录（保留收藏）
    await this.trimHistory()

    return {
      id,
      sourceText: record.sourceText,
      translatedText: record.translatedText,
      sourceLang: record.sourceLang,
      targetLang: record.targetLang,
      isFavorite: false,
      createdAt: now
    }
  }

  /**
   * 获取翻译历史
   * @param limit - 返回数量
   * @param offset - 偏移量
   */
  async getHistory(limit: number = 50, offset: number = 0): Promise<TranslationRecord[]> {
    const rows = await this.db.query<HistoryRow>(
      `SELECT * FROM translation_history ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    )
    return rows.map(this.rowToRecord)
  }

  /**
   * 搜索翻译历史
   * @param keyword - 搜索关键词
   */
  async search(keyword: string): Promise<TranslationRecord[]> {
    const pattern = `%${keyword}%`
    const rows = await this.db.query<HistoryRow>(
      `SELECT * FROM translation_history
       WHERE source_text LIKE ? OR translated_text LIKE ?
       ORDER BY created_at DESC LIMIT 50`,
      [pattern, pattern]
    )
    return rows.map(this.rowToRecord)
  }

  /**
   * 切换收藏状态
   */
  async toggleFavorite(id: string): Promise<boolean> {
    const row = await this.db.get<HistoryRow>(
      `SELECT * FROM translation_history WHERE id = ?`,
      [id]
    )
    if (!row) return false

    const newFav = row.is_favorite ? 0 : 1
    await this.db.run(
      `UPDATE translation_history SET is_favorite = ? WHERE id = ?`,
      [newFav, id]
    )
    return true
  }

  /**
   * 获取收藏列表
   */
  async getFavorites(): Promise<TranslationRecord[]> {
    const rows = await this.db.query<HistoryRow>(
      `SELECT * FROM translation_history WHERE is_favorite = 1 ORDER BY created_at DESC`
    )
    return rows.map(this.rowToRecord)
  }

  /**
   * 删除记录
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.run(`DELETE FROM translation_history WHERE id = ?`, [id])
    return result.changes > 0
  }

  /**
   * 清理超限记录（保留收藏）
   */
  private async trimHistory(): Promise<void> {
    const countRow = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM translation_history WHERE is_favorite = 0`
    )
    const count = countRow?.count ?? 0
    if (count > this.maxHistory) {
      const excess = count - this.maxHistory
      await this.db.run(
        `DELETE FROM translation_history WHERE id IN (
           SELECT id FROM translation_history WHERE is_favorite = 0 ORDER BY created_at ASC LIMIT ?
         )`,
        [excess]
      )
    }
  }

  /**
   * 数据库行 → 记录对象
   */
  private rowToRecord(row: HistoryRow): TranslationRecord {
    return {
      id: row.id,
      sourceText: row.source_text,
      translatedText: row.translated_text,
      sourceLang: row.source_lang,
      targetLang: row.target_lang,
      isFavorite: row.is_favorite === 1,
      createdAt: row.created_at
    }
  }
}
