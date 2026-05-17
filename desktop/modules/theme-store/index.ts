import type { Module, ModuleContext, Capability } from '../../src/main/types/module'

interface Theme { id: string; name: string; author: string; description: string; preview: string; colors: Record<string, string>; installed: boolean; active: boolean }

const BUILTIN_THEMES: Theme[] = [
  { id: 'default', name: '默认主题', author: 'setone', description: '清新蓝白默认主题', preview: '', colors: { primary: '#4a9eff', accent: '#a855f7', bg: '#0f172a', surface: '#1e293b' }, installed: true, active: true },
  { id: 'dark', name: '暗夜模式', author: 'setone', description: '纯黑护眼暗色主题', preview: '', colors: { primary: '#6366f1', accent: '#ec4899', bg: '#000000', surface: '#111111' }, installed: true, active: false },
  { id: 'sakura', name: '樱花粉', author: 'setone', description: '少女心粉色主题', preview: '', colors: { primary: '#f472b6', accent: '#c084fc', bg: '#fdf2f8', surface: '#fce7f3' }, installed: false, active: false },
  { id: 'forest', name: '森林绿', author: 'setone', description: '自然绿色护眼主题', preview: '', colors: { primary: '#22c55e', accent: '#14b8a6', bg: '#052e16', surface: '#14532d' }, installed: false, active: false },
  { id: 'sunset', name: '日落橙', author: 'setone', description: '温暖橙色主题', preview: '', colors: { primary: '#f97316', accent: '#eab308', bg: '#431407', surface: '#7c2d12' }, installed: false, active: false },
  { id: 'ocean', name: '深海蓝', author: 'setone', description: '深邃蓝色主题', preview: '', colors: { primary: '#06b6d4', accent: '#8b5cf6', bg: '#0c1222', surface: '#162032' }, installed: false, active: false }
]

export default class ThemeStoreModule implements Module {
  id = 'theme-store'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private themes: Theme[] = [...BUILTIN_THEMES]

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    // 从 DB 加载已安装的自定义主题
    try {
      const rows = await context.db.all('SELECT * FROM themes WHERE installed = 1')
      for (const row of rows as Theme[]) { if (!this.themes.find(t => t.id === row.id)) { row.installed = true; this.themes.push(row) } }
    } catch { /* table may not exist */ }
    // 读取当前激活主题
    try {
      const activeId = (await context.config as Record<string, unknown>)?.activeTheme as string
      if (activeId) { this.themes.forEach(t => t.active = t.id === activeId) }
    } catch { /* ignore */ }
    context.logger.info('主题商店模块已激活')
  }

  async deactivate(): Promise<void> { this.context.logger.info('主题商店模块已停用') }

  getCapabilities(): Capability[] {
    return [
      { type: 'tool', name: 'theme_list', description: '获取主题列表', priority: 10, moduleId: this.id, handler: {
        execute: async () => ({ success: true, data: this.themes })
      }},
      { type: 'tool', name: 'theme_apply', description: '应用主题', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; const t = this.themes.find(x => x.id === id); if (!t) return { success: false, error: '主题不存在' }; if (!t.installed) return { success: false, error: '主题未安装' }; this.themes.forEach(x => x.active = x.id === id); this.context.eventBus.emit('theme:changed' as never, { themeId: id, colors: t.colors } as never); return { success: true, data: t } }
      }},
      { type: 'tool', name: 'theme_install', description: '安装主题', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; const t = this.themes.find(x => x.id === id); if (!t) return { success: false, error: '主题不存在' }; t.installed = true; try { await this.context.db.run('INSERT OR REPLACE INTO themes (id, name, author, description, installed) VALUES (?, ?, ?, ?, 1)', [t.id, t.name, t.author, t.description]) } catch { /* ignore */ }; return { success: true, data: t } }
      }},
      { type: 'tool', name: 'theme_uninstall', description: '卸载主题', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; const t = this.themes.find(x => x.id === id); if (!t) return { success: false, error: '主题不存在' }; if (t.active) return { success: false, error: '不能卸载当前使用的主题' }; t.installed = false; try { await this.context.db.run('DELETE FROM themes WHERE id = ?', [id]) } catch { /* ignore */ }; return { success: true } }
      }},
      { type: 'tool', name: 'theme_export', description: '导出主题', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; const t = this.themes.find(x => x.id === id); if (!t) return { success: false, error: '主题不存在' }; try { const { dialog } = require('electron'); const result = await dialog.showSaveDialog({ defaultPath: `${t.name}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] }); if (!result.canceled && result.filePath) { const { writeFile } = require('fs/promises'); await writeFile(result.filePath, JSON.stringify(t, null, 2)); return { success: true, data: { path: result.filePath } } } return { success: false, error: '已取消' } } catch (e) { return { success: false, error: (e as Error).message } } }
      }}
    ]
  }
}
