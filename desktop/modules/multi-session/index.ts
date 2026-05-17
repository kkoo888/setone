import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { randomUUID } from 'crypto'

interface Session { id: string; name: string; model: string; messageCount: number; createdAt: number; lastActiveAt: number; pinned: boolean }

export default class MultiSessionModule implements Module {
  id = 'multi-session'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private sessions: Session[] = []
  private activeId: string | null = null

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    try {
      const rows = await context.db.all('SELECT * FROM sessions ORDER BY lastActiveAt DESC')
      this.sessions = rows as Session[]
    } catch { /* table may not exist */ }
    if (this.sessions.length === 0) {
      const defaultSession: Session = { id: randomUUID(), name: '默认会话', model: '', messageCount: 0, createdAt: Date.now(), lastActiveAt: Date.now(), pinned: true }
      this.sessions.push(defaultSession)
      this.activeId = defaultSession.id
    }
    context.logger.info('多会话管理模块已激活')
  }

  async deactivate(): Promise<void> { this.context.logger.info('多会话管理模块已停用') }

  private async saveSession(s: Session): Promise<void> {
    try { await this.context.db.run('INSERT OR REPLACE INTO sessions (id, name, model, messageCount, createdAt, lastActiveAt, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)', [s.id, s.name, s.model, s.messageCount, s.createdAt, s.lastActiveAt, s.pinned ? 1 : 0]) } catch { /* ignore */ }
  }

  getCapabilities(): Capability[] {
    return [
      { type: 'tool', name: 'session_list', description: '列出所有会话', priority: 10, moduleId: this.id, handler: {
        execute: async () => ({ success: true, data: this.sessions, activeId: this.activeId })
      }},
      { type: 'tool', name: 'session_create', description: '创建新会话', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { name, model } = (p ?? {}) as { name?: string; model?: string }; const s: Session = { id: randomUUID(), name: name ?? `会话 ${this.sessions.length + 1}`, model: model ?? '', messageCount: 0, createdAt: Date.now(), lastActiveAt: Date.now(), pinned: false }; this.sessions.unshift(s); await this.saveSession(s); return { success: true, data: s } }
      }},
      { type: 'tool', name: 'session_switch', description: '切换会话', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; const s = this.sessions.find(x => x.id === id); if (!s) return { success: false, error: '会话不存在' }; this.activeId = id; s.lastActiveAt = Date.now(); await this.saveSession(s); return { success: true } }
      }},
      { type: 'tool', name: 'session_delete', description: '删除会话', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; this.sessions = this.sessions.filter(x => x.id !== id); try { await this.context.db.run('DELETE FROM sessions WHERE id = ?', [id]) } catch { /* ignore */ }; if (this.activeId === id) this.activeId = this.sessions[0]?.id ?? null; return { success: true } }
      }},
      { type: 'tool', name: 'session_rename', description: '重命名会话', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id, name } = p as { id: string; name: string }; const s = this.sessions.find(x => x.id === id); if (!s) return { success: false, error: '会话不存在' }; s.name = name; await this.saveSession(s); return { success: true } }
      }},
      { type: 'tool', name: 'session_pin', description: '固定/取消固定', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; const s = this.sessions.find(x => x.id === id); if (!s) return { success: false, error: '会话不存在' }; s.pinned = !s.pinned; await this.saveSession(s); return { success: true, data: { pinned: s.pinned } } }
      }}
    ]
  }
}
