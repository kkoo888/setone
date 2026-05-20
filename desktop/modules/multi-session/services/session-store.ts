import type { Session } from '../types'
import { randomUUID } from 'crypto'

/**
 * @deprecated 已由 SessionRepository + SessionService 替代，将在下个版本移除
 * @see repositories/session-repository.ts
 * @see services/session-service.ts
 */
export class SessionStore {
  private sessions: Session[] = []
  private activeId: string | null = null

  constructor(private db: { all: (sql: string, params?: unknown[]) => Promise<unknown[]>; run: (sql: string, params?: unknown[]) => Promise<unknown> }) {}

  async loadAll(): Promise<void> {
    try {
      const rows = await this.db.all('SELECT * FROM sessions ORDER BY lastActiveAt DESC')
      this.sessions = rows as Session[]
    } catch { /* table may not exist */ }
    if (this.sessions.length === 0) {
      const defaultSession: Session = { id: randomUUID(), name: '默认会话', model: '', messageCount: 0, createdAt: Date.now(), lastActiveAt: Date.now(), pinned: true }
      this.sessions.push(defaultSession)
      this.activeId = defaultSession.id
    }
  }

  getAll(): Session[] {
    return this.sessions
  }

  getActiveId(): string | null {
    return this.activeId
  }

  findById(id: string): Session | undefined {
    return this.sessions.find(s => s.id === id)
  }

  create(name?: string, model?: string): Session {
    const s: Session = { id: randomUUID(), name: name ?? `会话 ${this.sessions.length + 1}`, model: model ?? '', messageCount: 0, createdAt: Date.now(), lastActiveAt: Date.now(), pinned: false }
    this.sessions.unshift(s)
    this.saveToDb(s)
    return s
  }

  switchTo(id: string): Session | null {
    const s = this.sessions.find(x => x.id === id)
    if (!s) return null
    this.activeId = id
    s.lastActiveAt = Date.now()
    this.saveToDb(s)
    return s
  }

  delete(id: string): boolean {
    const idx = this.sessions.findIndex(x => x.id === id)
    if (idx === -1) return false
    this.sessions.splice(idx, 1)
    try { this.db.run('DELETE FROM sessions WHERE id = ?', [id]) } catch { /* ignore */ }
    if (this.activeId === id) this.activeId = this.sessions[0]?.id ?? null
    return true
  }

  rename(id: string, name: string): Session | null {
    const s = this.sessions.find(x => x.id === id)
    if (!s) return null
    s.name = name
    this.saveToDb(s)
    return s
  }

  togglePin(id: string): boolean | null {
    const s = this.sessions.find(x => x.id === id)
    if (!s) return null
    s.pinned = !s.pinned
    this.saveToDb(s)
    return s.pinned
  }

  private saveToDb(s: Session): void {
    try {
      this.db.run(
        'INSERT OR REPLACE INTO sessions (id, name, model, messageCount, createdAt, lastActiveAt, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [s.id, s.name, s.model, s.messageCount, s.createdAt, s.lastActiveAt, s.pinned ? 1 : 0]
      )
    } catch { /* ignore */ }
  }
}
