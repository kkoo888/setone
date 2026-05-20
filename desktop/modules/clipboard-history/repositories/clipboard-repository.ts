import type { ClipItem } from '../types'
import type { Logger } from '../../../src/main/types/logger'

/**
 * 剪贴板历史 Repository 层
 * 负责 clipboard_history 表的 CRUD 及内存缓存，不含业务逻辑
 */
export class ClipboardRepository {
  private cache: ClipItem[] = []

  constructor(
    private readonly db: { all: (sql: string, params?: unknown[]) => Promise<unknown[]>; run: (sql: string, params?: unknown[]) => Promise<unknown> },
    private readonly logger: Logger,
    private readonly maxCacheSize: number = 500
  ) {}

  /**
   * 初始化：建表 + 加载缓存
   */
  async init(): Promise<void> {
    await this.ensureTable()
    await this.loadCache()
  }

  /**
   * 同步获取缓存快照（高频调用）
   * 返回只读数组，防止外部直接修改内部缓存
   */
  getCache(): readonly ClipItem[] {
    return this.cache
  }

  /**
   * 从缓存中按 ID 查找
   */
  findById(id: string): ClipItem | undefined {
    return this.cache.find(c => c.id === id)
  }

  /**
   * 持久化 + 更新缓存
   */
  async save(item: ClipItem): Promise<void> {
    await this.db.run(
      'INSERT OR REPLACE INTO clipboard_history (id, content, type, createdAt, pinned) VALUES (?, ?, ?, ?, ?)',
      [item.id, item.content, item.type, item.createdAt, item.pinned ? 1 : 0]
    )

    const idx = this.cache.findIndex(c => c.id === item.id)
    if (idx !== -1) {
      this.cache[idx] = item
    } else {
      this.cache.unshift(item)
    }
    this.trimCache()
  }

  /**
   * 从缓存移除 + 删除 DB 记录
   */
  async removeById(id: string): Promise<boolean> {
    const idx = this.cache.findIndex(c => c.id === id)
    if (idx === -1) return false
    this.cache.splice(idx, 1)
    await this.db.run('DELETE FROM clipboard_history WHERE id = ?', [id])
    return true
  }

  /**
   * 清除未固定的记录
   */
  async clearUnpinned(): Promise<void> {
    this.cache = this.cache.filter(c => c.pinned)
    await this.db.run('DELETE FROM clipboard_history WHERE pinned = 0')
  }

  /**
   * 建表
   */
  private async ensureTable(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS clipboard_history (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        createdAt INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  /**
   * 从 DB 加载全部到缓存
   */
  private async loadCache(): Promise<void> {
    const rows = await this.db.all('SELECT * FROM clipboard_history ORDER BY createdAt DESC LIMIT ?', [this.maxCacheSize])
    this.cache = rows.map(row => this.toEntity(row))
    this.logger.info(`ClipboardRepository 缓存已加载，共 ${this.cache.length} 条`)
  }

  /**
   * DB 行 → ClipItem 映射
   */
  private toEntity(row: unknown): ClipItem {
    const r = row as Record<string, unknown>
    return {
      id: r.id as string,
      content: r.content as string,
      type: (r.type as ClipItem['type']) ?? 'text',
      createdAt: r.createdAt as number,
      pinned: Boolean(r.pinned)
    }
  }

  /**
   * 裁剪缓存至最大容量
   */
  private trimCache(): void {
    if (this.cache.length > this.maxCacheSize) {
      // 保留 pinned 项 + 最新项，裁剪尾部
      this.cache = this.cache.slice(0, this.maxCacheSize)
    }
  }
}
