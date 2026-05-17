import type { Theme } from '../types'

const BUILTIN_THEMES: Theme[] = [
  { id: 'default', name: '默认主题', author: 'setone', description: '清新蓝白默认主题', preview: '', colors: { primary: '#4a9eff', accent: '#a855f7', bg: '#0f172a', surface: '#1e293b' }, installed: true, active: true },
  { id: 'dark', name: '暗夜模式', author: 'setone', description: '纯黑护眼暗色主题', preview: '', colors: { primary: '#6366f1', accent: '#ec4899', bg: '#000000', surface: '#111111' }, installed: true, active: false },
  { id: 'sakura', name: '樱花粉', author: 'setone', description: '少女心粉色主题', preview: '', colors: { primary: '#f472b6', accent: '#c084fc', bg: '#fdf2f8', surface: '#fce7f3' }, installed: false, active: false },
  { id: 'forest', name: '森林绿', author: 'setone', description: '自然绿色护眼主题', preview: '', colors: { primary: '#22c55e', accent: '#14b8a6', bg: '#052e16', surface: '#14532d' }, installed: false, active: false },
  { id: 'sunset', name: '日落橙', author: 'setone', description: '温暖橙色主题', preview: '', colors: { primary: '#f97316', accent: '#eab308', bg: '#431407', surface: '#7c2d12' }, installed: false, active: false },
  { id: 'ocean', name: '深海蓝', author: 'setone', description: '深邃蓝色主题', preview: '', colors: { primary: '#06b6d4', accent: '#8b5cf6', bg: '#0c1222', surface: '#162032' }, installed: false, active: false }
]

/**
 * 主题存储服务
 * 管理内置主题列表及已安装的自定义主题
 */
export class ThemeStore {
  private themes: Theme[] = [...BUILTIN_THEMES]

  constructor(private db: { all: (sql: string, params?: unknown[]) => Promise<unknown[]>; run: (sql: string, params?: unknown[]) => Promise<unknown> }, private config: unknown) {}

  async loadInstalled(): Promise<void> {
    try {
      const rows = await this.db.all('SELECT * FROM themes WHERE installed = 1')
      for (const row of rows as Theme[]) {
        if (!this.themes.find(t => t.id === row.id)) { row.installed = true; this.themes.push(row) }
      }
    } catch { /* table may not exist */ }
    try {
      const activeId = (this.config as Record<string, unknown>)?.activeTheme as string
      if (activeId) this.themes.forEach(t => t.active = t.id === activeId)
    } catch { /* ignore */ }
  }

  getAll(): Theme[] { return this.themes }

  findById(id: string): Theme | undefined { return this.themes.find(t => t.id === id) }

  apply(id: string): Theme | null {
    const t = this.themes.find(x => x.id === id)
    if (!t || !t.installed) return null
    this.themes.forEach(x => x.active = x.id === id)
    return t
  }

  async install(id: string): Promise<Theme | null> {
    const t = this.themes.find(x => x.id === id)
    if (!t) return null
    t.installed = true
    try { await this.db.run('INSERT OR REPLACE INTO themes (id, name, author, description, installed) VALUES (?, ?, ?, ?, 1)', [t.id, t.name, t.author, t.description]) } catch { /* ignore */ }
    return t
  }

  async uninstall(id: string): Promise<{ ok: boolean; error?: string }> {
    const t = this.themes.find(x => x.id === id)
    if (!t) return { ok: false, error: '主题不存在' }
    if (t.active) return { ok: false, error: '不能卸载当前使用的主题' }
    t.installed = false
    try { await this.db.run('DELETE FROM themes WHERE id = ?', [id]) } catch { /* ignore */ }
    return { ok: true }
  }

  async exportToFile(id: string): Promise<string | null> {
    const t = this.themes.find(x => x.id === id)
    if (!t) return null
    const { dialog } = require('electron')
    const result = await dialog.showSaveDialog({ defaultPath: `${t.name}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (!result.canceled && result.filePath) {
      const { writeFile } = require('fs/promises')
      await writeFile(result.filePath, JSON.stringify(t, null, 2))
      return result.filePath
    }
    return null
  }
}
