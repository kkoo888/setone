import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { randomUUID } from 'crypto'

interface Snippet { id: string; title: string; language: string; code: string; description: string; tags: string[]; createdAt: number; usageCount: number }

export default class CodeSnippetsModule implements Module {
  id = 'code-snippets'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private snippets: Snippet[] = []

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    try {
      const rows = await context.db.all('SELECT * FROM code_snippets ORDER BY usageCount DESC')
      this.snippets = (rows as Array<Record<string, unknown>>).map(r => ({ ...r, tags: typeof r.tags === 'string' ? JSON.parse(r.tags as string) : (r.tags ?? []) })) as Snippet[]
    } catch { /* table may not exist */ }
    context.logger.info('代码片段模块已激活')
  }

  async deactivate(): Promise<void> { this.context.logger.info('代码片段模块已停用') }

  private async saveSnippet(s: Snippet): Promise<void> {
    try { await this.context.db.run('INSERT OR REPLACE INTO code_snippets (id, title, language, code, description, tags, createdAt, usageCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [s.id, s.title, s.language, s.code, s.description, JSON.stringify(s.tags), s.createdAt, s.usageCount]) } catch { /* ignore */ }
  }

  getCapabilities(): Capability[] {
    return [
      { type: 'tool', name: 'snippet_list', description: '获取代码片段列表', priority: 10, moduleId: this.id, handler: {
        execute: async () => ({ success: true, data: this.snippets })
      }},
      { type: 'tool', name: 'snippet_create', description: '创建代码片段', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const params = p as Omit<Snippet, 'id' | 'createdAt' | 'usageCount'>; const s: Snippet = { id: randomUUID(), ...params, createdAt: Date.now(), usageCount: 0 }; this.snippets.push(s); await this.saveSnippet(s); return { success: true, data: s } }
      }},
      { type: 'tool', name: 'snippet_update', description: '更新代码片段', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id, ...updates } = p as Partial<Snippet> & { id: string }; const idx = this.snippets.findIndex(s => s.id === id); if (idx === -1) return { success: false, error: '片段不存在' }; this.snippets[idx] = { ...this.snippets[idx], ...updates }; await this.saveSnippet(this.snippets[idx]); return { success: true, data: this.snippets[idx] } }
      }},
      { type: 'tool', name: 'snippet_delete', description: '删除代码片段', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; this.snippets = this.snippets.filter(s => s.id !== id); try { await this.context.db.run('DELETE FROM code_snippets WHERE id = ?', [id]) } catch { /* ignore */ }; return { success: true } }
      }},
      { type: 'tool', name: 'snippet_use', description: '使用代码片段', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; const s = this.snippets.find(x => x.id === id); if (!s) return { success: false, error: '片段不存在' }; s.usageCount++; await this.saveSnippet(s); try { const { clipboard } = require('electron'); clipboard.writeText(s.code) } catch { /* ignore */ }; return { success: true, data: { code: s.code, usageCount: s.usageCount } } }
      }}
    ]
  }
}
