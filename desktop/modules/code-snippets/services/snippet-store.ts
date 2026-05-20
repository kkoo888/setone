import type { Snippet } from '../types'
import { randomUUID } from 'crypto'

/**
 * 代码片段存储服务
 * 负责 code_snippets 表的 CRUD 操作
 *
 * @deprecated 已由 SnippetRepository + SnippetService 分层架构替代，请使用新架构。
 */
export class SnippetStore {
  private snippets: Snippet[] = []

  constructor(private db: { all: (sql: string, params?: unknown[]) => Promise<unknown[]>; run: (sql: string, params?: unknown[]) => Promise<unknown> }) {}

  async loadAll(): Promise<void> {
    try {
      const rows = await this.db.all('SELECT * FROM code_snippets ORDER BY usageCount DESC')
      this.snippets = (rows as Array<Record<string, unknown>>).map(r => ({
        ...r,
        tags: typeof r.tags === 'string' ? JSON.parse(r.tags as string) : (r.tags ?? [])
      })) as Snippet[]
    } catch { /* table may not exist */ }
  }

  getAll(): Snippet[] {
    return this.snippets
  }

  findById(id: string): Snippet | undefined {
    return this.snippets.find(s => s.id === id)
  }

  create(params: Omit<Snippet, 'id' | 'createdAt' | 'usageCount'>): Snippet {
    const s: Snippet = { id: randomUUID(), ...params, createdAt: Date.now(), usageCount: 0 }
    this.snippets.push(s)
    this.saveToDb(s)
    return s
  }

  update(id: string, updates: Partial<Snippet>): Snippet | null {
    const idx = this.snippets.findIndex(s => s.id === id)
    if (idx === -1) return null
    this.snippets[idx] = { ...this.snippets[idx], ...updates }
    this.saveToDb(this.snippets[idx])
    return this.snippets[idx]
  }

  delete(id: string): boolean {
    const idx = this.snippets.findIndex(s => s.id === id)
    if (idx === -1) return false
    this.snippets.splice(idx, 1)
    try { this.db.run('DELETE FROM code_snippets WHERE id = ?', [id]) } catch { /* ignore */ }
    return true
  }

  incrementUsage(id: string): Snippet | null {
    const s = this.snippets.find(x => x.id === id)
    if (!s) return null
    s.usageCount++
    this.saveToDb(s)
    return s
  }

  private saveToDb(s: Snippet): void {
    try {
      this.db.run(
        'INSERT OR REPLACE INTO code_snippets (id, title, language, code, description, tags, createdAt, usageCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [s.id, s.title, s.language, s.code, s.description, JSON.stringify(s.tags), s.createdAt, s.usageCount]
      )
    } catch { /* ignore */ }
  }
}
