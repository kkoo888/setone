import type { Snippet } from '../types'

interface DbAdapter {
  all: (sql: string, params?: unknown[]) => Promise<unknown[]>
  run: (sql: string, params?: unknown[]) => Promise<unknown>
}

interface Logger {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

const TABLE = 'code_snippets'

export class SnippetRepository {
  private cache: Snippet[] = []

  constructor(
    private readonly db: DbAdapter,
    private readonly logger: Logger
  ) {}

  /** 建表 + 加载缓存 */
  async init(): Promise<void> {
    await this.ensureTable()
    await this.loadCache()
    this.logger.info(`[SnippetRepository] 初始化完成，已加载 ${this.cache.length} 条片段`)
  }

  /** 同步获取缓存 */
  getCache(): Snippet[] {
    return this.cache
  }

  async findById(id: string): Promise<Snippet | undefined> {
    const rows = await this.db.all(`SELECT * FROM ${TABLE} WHERE id = ?`, [id])
    if (rows.length === 0) return undefined
    return this.toEntity(rows[0] as Record<string, unknown>)
  }

  async findAll(): Promise<Snippet[]> {
    const rows = await this.db.all(`SELECT * FROM ${TABLE} ORDER BY usageCount DESC`)
    return (rows as Array<Record<string, unknown>>).map(r => this.toEntity(r))
  }

  async save(snippet: Snippet): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO ${TABLE} (id, title, language, code, description, tags, createdAt, usageCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [snippet.id, snippet.title, snippet.language, snippet.code, snippet.description, JSON.stringify(snippet.tags), snippet.createdAt, snippet.usageCount]
    )
    const idx = this.cache.findIndex(s => s.id === snippet.id)
    if (idx >= 0) {
      this.cache[idx] = snippet
    } else {
      this.cache.push(snippet)
    }
  }

  async removeById(id: string): Promise<boolean> {
    const changes = await this.db.run(`DELETE FROM ${TABLE} WHERE id = ?`, [id]) as { changes?: number } | undefined
    const deleted = (changes?.changes ?? 0) > 0
    if (deleted) {
      this.cache = this.cache.filter(s => s.id !== id)
    }
    return deleted
  }

  async count(): Promise<number> {
    const rows = await this.db.all(`SELECT COUNT(*) as cnt FROM ${TABLE}`)
    return Number((rows[0] as Record<string, unknown>).cnt ?? 0)
  }

  // ── private ──────────────────────────────────────────────

  private toEntity(row: Record<string, unknown>): Snippet {
    return {
      id: String(row.id),
      title: String(row.title ?? ''),
      language: String(row.language ?? ''),
      code: String(row.code ?? ''),
      description: String(row.description ?? ''),
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags as string) : (Array.isArray(row.tags) ? row.tags : []),
      createdAt: Number(row.createdAt ?? 0),
      usageCount: Number(row.usageCount ?? 0)
    }
  }

  private async ensureTable(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        language TEXT NOT NULL,
        code TEXT NOT NULL,
        description TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        createdAt INTEGER NOT NULL,
        usageCount INTEGER DEFAULT 0
      )
    `)
  }

  private async loadCache(): Promise<void> {
    this.cache = await this.findAll()
  }
}
