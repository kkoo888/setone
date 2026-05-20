/**
 * @deprecated 请使用 ClipboardRepository + ClipboardService 分层架构替代。
 * 本文件保留仅作迁移参考，后续版本将移除。
 */
import type { ClipItem } from '../types'
import { randomUUID } from 'crypto'

/**
 * 剪贴板存储服务
 * 负责 clipboard_history 表的 CRUD 操作及内存缓存
 * @deprecated 使用 ClipboardRepository + ClipboardService 替代
 */
export class ClipboardStore {
  private clips: ClipItem[] = []
  private maxSize = 500

  constructor(private db: { all: (sql: string, params?: unknown[]) => Promise<unknown[]>; run: (sql: string, params?: unknown[]) => Promise<unknown> }) {}

  async loadAll(): Promise<void> {
    try {
      const rows = await this.db.all('SELECT * FROM clipboard_history ORDER BY createdAt DESC LIMIT 200')
      this.clips = rows as ClipItem[]
    } catch { /* table may not exist */ }
  }

  getAll(): ClipItem[] {
    return this.clips
  }

  getRecent(limit: number): ClipItem[] {
    return this.clips.slice(0, limit)
  }

  findById(id: string): ClipItem | undefined {
    return this.clips.find(c => c.id === id)
  }

  async addFromText(text: string): Promise<ClipItem | null> {
    if (!text || !text.trim()) return null
    if (this.clips.length > 0 && this.clips[0].content === text) return null

    const item: ClipItem = { id: randomUUID(), content: text, type: 'text', createdAt: Date.now(), pinned: false }
    this.clips.unshift(item)
    if (this.clips.length > this.maxSize) this.clips = this.clips.slice(0, this.maxSize)

    try {
      await this.db.run('INSERT INTO clipboard_history (id, content, type, createdAt, pinned) VALUES (?, ?, ?, ?, ?)', [item.id, item.content, item.type, item.createdAt, 0])
    } catch { /* ignore */ }
    return item
  }

  async togglePin(id: string): Promise<boolean | null> {
    const item = this.clips.find(c => c.id === id)
    if (!item) return null
    item.pinned = !item.pinned
    try {
      await this.db.run('UPDATE clipboard_history SET pinned = ? WHERE id = ?', [item.pinned ? 1 : 0, id])
    } catch { /* ignore */ }
    return item.pinned
  }

  async remove(id: string): Promise<boolean> {
    const idx = this.clips.findIndex(c => c.id === id)
    if (idx === -1) return false
    this.clips.splice(idx, 1)
    try { await this.db.run('DELETE FROM clipboard_history WHERE id = ?', [id]) } catch { /* ignore */ }
    return true
  }

  async clearUnpinned(): Promise<void> {
    this.clips = this.clips.filter(c => c.pinned)
    try { await this.db.run('DELETE FROM clipboard_history WHERE pinned = 0') } catch { /* ignore */ }
  }

  async writeToClipboard(content: string, clipboard: { writeText: (text: string) => void }): Promise<void> {
    clipboard.writeText(content)
  }
}
