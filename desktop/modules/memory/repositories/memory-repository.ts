import type { Logger } from '../../../../src/main/types/logger'
import type { DatabaseManager } from '../../../../src/main/types/database'
import type { MemoryItem } from '../services/memory-manager'

/**
 * MemoryRepository — 记忆持久化层
 * 负责 memories 表的 CRUD，JSON 字段在此序列化/反序列化
 */
export class MemoryRepository {
  constructor(
    private readonly db: DatabaseManager,
    private readonly logger: Logger
  ) {}

  /** 建表 memories */
  async init(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'short-term',
        tags TEXT DEFAULT '[]',
        timestamp INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `)
    this.logger.info('memories 数据表已初始化')
  }

  /** 按 id 查找 */
  async findById(id: string): Promise<MemoryItem | undefined> {
    const row = await this.db.get<{
      id: string
      content: string
      type: string
      tags: string
      timestamp: number
      metadata: string
    }>('SELECT * FROM memories WHERE id = ?', [id])
    return row ? this.toEntity(row) : undefined
  }

  /** 查找全部，按 timestamp ASC */
  async findAll(): Promise<MemoryItem[]> {
    const rows = await this.db.query<{
      id: string
      content: string
      type: string
      tags: string
      timestamp: number
      metadata: string
    }>('SELECT * FROM memories ORDER BY timestamp ASC')
    return rows.map((row) => this.toEntity(row))
  }

  /** 按类型查找 */
  async findByType(type: 'short-term' | 'long-term'): Promise<MemoryItem[]> {
    const rows = await this.db.query<{
      id: string
      content: string
      type: string
      tags: string
      timestamp: number
      metadata: string
    }>('SELECT * FROM memories WHERE type = ? ORDER BY timestamp ASC', [type])
    return rows.map((row) => this.toEntity(row))
  }

  /** 保存（INSERT OR REPLACE），tags/metadata 在此序列化 */
  async save(item: MemoryItem): Promise<void> {
    await this.db.run(
      'INSERT OR REPLACE INTO memories (id, content, type, tags, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      [
        item.id,
        item.content,
        item.type,
        JSON.stringify(item.tags),
        item.timestamp,
        JSON.stringify(item.metadata ?? {})
      ]
    )
  }

  /** 按 id 删除，返回是否找到并删除 */
  async removeById(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM memories WHERE id = ?', [id])
    return result.changes > 0
  }

  /** 更新 type 字段 */
  async updateType(id: string, type: 'short-term' | 'long-term'): Promise<void> {
    await this.db.run('UPDATE memories SET type = ? WHERE id = ?', [type, id])
  }

  /** 总数 */
  async count(): Promise<number> {
    const row = await this.db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM memories')
    return row?.cnt ?? 0
  }

  /** 批量删除 */
  async removeBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(', ')
    await this.db.run(`DELETE FROM memories WHERE id IN (${placeholders})`, ids)
  }

  /** 行映射：tags/metadata JSON → 对象 */
  private toEntity(row: {
    id: string
    content: string
    type: string
    tags: string
    timestamp: number
    metadata: string
  }): MemoryItem {
    return {
      id: row.id,
      content: row.content,
      type: row.type as 'short-term' | 'long-term',
      tags: this.safeParseJson<string[]>(row.tags, []),
      timestamp: row.timestamp,
      metadata: this.safeParseJson<Record<string, unknown>>(row.metadata, {})
    }
  }

  private safeParseJson<T>(json: string, fallback: T): T {
    try {
      return JSON.parse(json) as T
    } catch {
      return fallback
    }
  }
}
