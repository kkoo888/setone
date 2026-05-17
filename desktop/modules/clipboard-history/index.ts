import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { ClipItem } from './types'
import { randomUUID } from 'crypto'

export default class ClipboardHistoryModule implements Module {
  id = 'clipboard-history'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private clips: ClipItem[] = []
  private pollTimer?: NodeJS.Timeout

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    // 从 DB 加载历史
    try {
      const rows = await context.db.all('SELECT * FROM clipboard_history ORDER BY createdAt DESC LIMIT 200')
      this.clips = rows as ClipItem[]
    } catch { /* table may not exist */ }
    // 轮询剪贴板变化
    this.pollTimer = setInterval(() => this.checkClipboard(), 2000)
    context.logger.info('剪贴板历史模块已激活')
  }

  async deactivate(): Promise<void> {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = undefined }
    this.context.logger.info('剪贴板历史模块已停用')
  }

  private async checkClipboard(): Promise<void> {
    try {
      const { clipboard } = require('electron')
      const text = clipboard.readText()
      if (text && text.trim() && (this.clips.length === 0 || this.clips[0].content !== text)) {
        const item: ClipItem = { id: randomUUID(), content: text, type: 'text', createdAt: Date.now(), pinned: false }
        this.clips.unshift(item)
        if (this.clips.length > 500) this.clips = this.clips.slice(0, 500)
        try { await this.context.db.run('INSERT INTO clipboard_history (id, content, type, createdAt, pinned) VALUES (?, ?, ?, ?, ?)', [item.id, item.content, item.type, item.createdAt, 0]) } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  getCapabilities(): Capability[] {
    return [
      { type: 'tool', name: 'clipboard_list', description: '获取剪贴板历史', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { limit } = (p ?? {}) as { limit?: number }; return { success: true, data: this.clips.slice(0, limit ?? 200) } }
      }},
      { type: 'tool', name: 'clipboard_copy', description: '复制到剪贴板', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; const item = this.clips.find(c => c.id === id); if (!item) return { success: false, error: '记录不存在' }; const { clipboard } = require('electron'); clipboard.writeText(item.content); return { success: true } }
      }},
      { type: 'tool', name: 'clipboard_pin', description: '固定/取消固定', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; const item = this.clips.find(c => c.id === id); if (!item) return { success: false, error: '记录不存在' }; item.pinned = !item.pinned; try { await this.context.db.run('UPDATE clipboard_history SET pinned = ? WHERE id = ?', [item.pinned ? 1 : 0, id]) } catch { /* ignore */ }; return { success: true, data: { pinned: item.pinned } } }
      }},
      { type: 'tool', name: 'clipboard_delete', description: '删除记录', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; this.clips = this.clips.filter(c => c.id !== id); try { await this.context.db.run('DELETE FROM clipboard_history WHERE id = ?', [id]) } catch { /* ignore */ }; return { success: true } }
      }},
      { type: 'tool', name: 'clipboard_clear', description: '清空历史', priority: 10, moduleId: this.id, handler: {
        execute: async () => { this.clips = this.clips.filter(c => c.pinned); try { await this.context.db.run('DELETE FROM clipboard_history WHERE pinned = 0') } catch { /* ignore */ }; return { success: true } }
      }},
      { type: 'tool', name: 'clipboard_write', description: '写入剪贴板', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { content } = p as { content: string }; const { clipboard } = require('electron'); clipboard.writeText(content); return { success: true } }
      }}
    ]
  }
}
