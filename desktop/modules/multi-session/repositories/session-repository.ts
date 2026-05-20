import type { Session } from '../types'
import { randomUUID } from 'crypto'

interface DbAdapter {
  all: (sql: string, params?: unknown[]) => Promise<unknown[]>
  run: (sql: string, params?: unknown[]) => Promise<unknown>
}

interface Logger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/**
 * 会话数据仓库
 * 负责 sessions 表的 CRUD 及内存缓存，不含业务逻辑
 */
export class SessionRepository {
  private cache: Session[] = []
  private activeId: string | null = null

  constructor(
    private db: DbAdapter,
    private logger: Logger,
  ) {}

  /** 建表 + 加载缓存，若为空则创建默认会话 */
  async init(): Promise<void> {
    await this.ensureTable()
    const rows = await this.db.all('SELECT * FROM sessions ORDER BY lastActiveAt DESC')
    this.cache = rows.map((row) => this.toEntity(row))

    if (this.cache.length === 0) {
      const defaultSession: Session = {
        id: randomUUID(),
        name: '默认会话',
        model: '',
        messageCount: 0,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        pinned: true,
      }
      this.cache.push(defaultSession)
      this.activeId = defaultSession.id
      await this.save(defaultSession)
      this.logger.info('已创建默认会话', defaultSession.id)
    }
  }

  /** 同步获取缓存 */
  getCache(): Session[] {
    return this.cache
  }

  /** 获取当前活跃会话 ID */
  getActiveId(): string | null {
    return this.activeId
  }

  /** 按 ID 查找 */
  async findById(id: string): Promise<Session | undefined> {
    return this.cache.find((s) => s.id === id)
  }

  /** 保存（INSERT OR REPLACE） */
  async save(session: Session): Promise<void> {
    await this.db.run(
      'INSERT OR REPLACE INTO sessions (id, name, model, messageCount, createdAt, lastActiveAt, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [session.id, session.name, session.model, session.messageCount, session.createdAt, session.lastActiveAt, session.pinned ? 1 : 0],
    )
    const idx = this.cache.findIndex((s) => s.id === session.id)
    if (idx !== -1) {
      this.cache[idx] = session
    } else {
      this.cache.unshift(session)
    }
  }

  /** 按 ID 删除，若删的是 activeId 则切换到第一个 */
  async removeById(id: string): Promise<boolean> {
    const idx = this.cache.findIndex((s) => s.id === id)
    if (idx === -1) return false

    this.cache.splice(idx, 1)
    await this.db.run('DELETE FROM sessions WHERE id = ?', [id])

    if (this.activeId === id) {
      this.activeId = this.cache[0]?.id ?? null
    }
    return true
  }

  /** 设置当前活跃会话 ID */
  setActiveId(id: string): void {
    this.activeId = id
  }

  /** 会话数量 */
  async count(): Promise<number> {
    return this.cache.length
  }

  /** 行映射：pinned 0/1 → boolean */
  private toEntity(row: unknown): Session {
    const r = row as Record<string, unknown>
    return {
      id: r.id as string,
      name: r.name as string,
      model: (r.model as string) ?? '',
      messageCount: (r.messageCount as number) ?? 0,
      createdAt: r.createdAt as number,
      lastActiveAt: r.lastActiveAt as number,
      pinned: Boolean(r.pinned),
    }
  }

  /** 建表 */
  private async ensureTable(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model TEXT DEFAULT '',
        messageCount INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        lastActiveAt INTEGER NOT NULL,
        pinned INTEGER DEFAULT 0
      )
    `)
  }
}
