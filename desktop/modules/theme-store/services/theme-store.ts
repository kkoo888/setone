import type { Theme, ThemeMode, ThemeSource } from '../types'
import type { DatabaseManager } from '../../../src/main/types/database'
import type { ConfigManager } from '../../../src/main/types/config'
import type { Logger } from '../../../src/main/types/logger'
import { dialog } from 'electron'
import { writeFile, readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, basename } from 'path'

/** 内置主题列表（始终可用，不可删除） */
const BUILTIN_THEMES: Theme[] = [
  {
    id: 'light', name: '亮色模式', author: 'setone', description: '明亮清爽的默认亮色主题', preview: '',
    mode: 'light',
    colors: {
      accent: '#4338ca', 'accent-hover': '#3730a3', 'accent-light': '#a78bfa',
      'bg-primary': '#ffffff', 'bg-secondary': '#f5f5f5', 'bg-tertiary': '#e8e8e8',
      'text-primary': '#1a1a1a', 'text-secondary': '#525252', 'text-tertiary': '#737373',
      border: '#e0e0e0', shadow: 'rgba(0, 0, 0, 0.1)',
      success: '#22c55e', warning: '#f59e0b', error: '#ef4444'
    },
    source: 'builtin', active: true
  },
  {
    id: 'dark', name: '暗色模式', author: 'setone', description: '柔和护眼的暗色主题', preview: '',
    mode: 'dark',
    colors: {
      accent: '#818cf8', 'accent-hover': '#6366f1', 'accent-light': '#c4b5fd',
      'bg-primary': '#1a1a2e', 'bg-secondary': '#16213e', 'bg-tertiary': '#0f3460',
      'text-primary': '#e8e8e8', 'text-secondary': '#b0b0b0', 'text-tertiary': '#808080',
      border: '#2a2a4a', shadow: 'rgba(0, 0, 0, 0.3)',
      success: '#34d399', warning: '#fbbf24', error: '#f87171', info: '#60a5fa'
    },
    source: 'builtin', active: false
  },
  {
    id: 'default', name: '清新蓝', author: 'setone', description: '蓝紫色强调色暗色主题', preview: '',
    mode: 'dark',
    colors: {
      accent: '#4a9eff', 'accent-hover': '#3b82f6', 'accent-light': '#93c5fd',
      'bg-primary': '#0f172a', 'bg-secondary': '#1e293b', 'bg-tertiary': '#1e3a5f',
      'text-primary': '#e2e8f0', 'text-secondary': '#94a3b8', 'text-tertiary': '#64748b',
      border: '#1e3a5f', shadow: 'rgba(0, 0, 0, 0.3)',
      success: '#34d399', warning: '#fbbf24', error: '#f87171', info: '#60a5fa'
    },
    source: 'builtin', active: false
  },
  {
    id: 'sakura', name: '樱花粉', author: 'setone', description: '少女心粉色主题', preview: '',
    mode: 'light',
    colors: { accent: '#be185d', 'accent-hover': '#9d174d', 'accent-light': '#f9a8d4', 'bg-primary': '#fdf2f8', 'bg-secondary': '#fce7f3' },
    source: 'builtin', active: false
  },
  {
    id: 'forest', name: '森林绿', author: 'setone', description: '自然绿色护眼主题', preview: '',
    mode: 'dark',
    colors: {
      accent: '#22c55e', 'accent-hover': '#16a34a', 'accent-light': '#86efac',
      'bg-primary': '#052e16', 'bg-secondary': '#14532d', 'bg-tertiary': '#166534',
      'text-primary': '#e8e8e8', 'text-secondary': '#b0b0b0', 'text-tertiary': '#808080',
      border: '#166534', shadow: 'rgba(0, 0, 0, 0.3)',
      success: '#34d399', warning: '#fbbf24', error: '#f87171', info: '#60a5fa'
    },
    source: 'builtin', active: false
  },
  {
    id: 'sunset', name: '日落橙', author: 'setone', description: '温暖橙色主题', preview: '',
    mode: 'dark',
    colors: {
      accent: '#f97316', 'accent-hover': '#ea580c', 'accent-light': '#fdba74',
      'bg-primary': '#431407', 'bg-secondary': '#7c2d12', 'bg-tertiary': '#9a3412',
      'text-primary': '#fef3c7', 'text-secondary': '#fcd34d', 'text-tertiary': '#d97706',
      border: '#92400e', shadow: 'rgba(0, 0, 0, 0.3)',
      success: '#34d399', warning: '#fbbf24', error: '#f87171', info: '#60a5fa'
    },
    source: 'builtin', active: false
  },
  {
    id: 'ocean', name: '深海蓝', author: 'setone', description: '深邃蓝色主题', preview: '',
    mode: 'dark',
    colors: {
      accent: '#06b6d4', 'accent-hover': '#0891b2', 'accent-light': '#67e8f9',
      'bg-primary': '#0c1222', 'bg-secondary': '#162032', 'bg-tertiary': '#1e3a5f',
      'text-primary': '#e0f2fe', 'text-secondary': '#7dd3fc', 'text-tertiary': '#38bdf8',
      border: '#155e75', shadow: 'rgba(0, 0, 0, 0.3)',
      success: '#34d399', warning: '#fbbf24', error: '#f87171', info: '#60a5fa'
    },
    source: 'builtin', active: false
  }
]

/**
 * 主题存储服务
 * 管理：内置主题 + 用户导入的主题 + 本地仓库可下载主题
 */
export class ThemeStore {
  private themes: Theme[] = []
  private db: DatabaseManager
  private config: ConfigManager
  private logger: Logger
  private themesDir: string
  private initialized = false

  constructor(db: DatabaseManager, config: ConfigManager, logger: Logger, themesDir: string) {
    this.db = db
    this.config = config
    this.logger = logger
    this.themesDir = themesDir
  }

  /** 初始化 */
  async init(): Promise<void> {
    if (this.initialized) return

    // 1. 加载内置主题
    this.themes = BUILTIN_THEMES.map(t => ({ ...t }))

    // 2. 建表（存储导入的自定义主题）
    try {
      await this.db.run(`CREATE TABLE IF NOT EXISTS themes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT 'dark',
        colors TEXT NOT NULL DEFAULT '{}',
        source TEXT NOT NULL DEFAULT 'imported'
      )`)
    } catch (err) {
      this.logger.warn('创建主题表失败', { error: err })
    }

    // 3. 加载已导入的自定义主题
    try {
      const rows = await this.db.all('SELECT * FROM themes')
      for (const row of rows as Array<{ id: string; name: string; author: string; description: string; mode: string; colors: string; source: string }>) {
        if (!this.themes.find(t => t.id === row.id)) {
          let colors: Record<string, string> = {}
          try { colors = JSON.parse(row.colors) } catch { /* ignore */ }
          this.themes.push({
            id: row.id, name: row.name, author: row.author, description: row.description,
            mode: (row.mode as ThemeMode) || 'dark', colors, preview: '',
            source: 'imported', active: false
          })
        }
      }
    } catch (err) {
      this.logger.debug('加载已导入主题（表可能不存在）', { error: err })
    }

    // 4. 扫描本地主题仓库（themes/ 目录）
    await this.scanThemesDir()

    // 5. 标记当前激活的主题
    const activeId = await this.config.get<string>('activeTheme')
    if (activeId) {
      this.themes.forEach(x => x.active = x.id === activeId)
    }

    this.initialized = true
  }

  /** 扫描 themes/ 目录，添加可下载的主题 */
  private async scanThemesDir(): Promise<void> {
    if (!existsSync(this.themesDir)) return
    try {
      const files = await readdir(this.themesDir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const filePath = join(this.themesDir, file)
        try {
          const raw = await readFile(filePath, 'utf-8')
          const data = JSON.parse(raw)
          if (data.id && data.name && !this.themes.find(t => t.id === data.id)) {
            this.themes.push({
              id: data.id, name: data.name, author: data.author || '',
              description: data.description || '', preview: '',
              mode: data.mode || 'dark', colors: data.colors || {},
              source: 'available', active: false
            })
          }
        } catch (err) {
          this.logger.debug(`跳过无效主题文件: ${file}`, { error: err })
        }
      }
    } catch (err) {
      this.logger.warn('扫描主题目录失败', { error: err })
    }
  }

  getAll(): Theme[] { return this.themes }

  findById(id: string): Theme | undefined { return this.themes.find(t => t.id === id) }

  /**
   * 应用主题
   * 从仓库"下载"时自动转为 imported
   */
  apply(id: string): { theme: Theme; mode: ThemeMode; colors: Record<string, string> } | null {
    const t = this.themes.find(x => x.id === id)
    if (!t) return null
    // 如果是可下载的主题，自动导入
    if (t.source === 'available') {
      t.source = 'imported'
      this.persistTheme(t).catch(() => { /* ignore */ })
    }
    this.themes.forEach(x => x.active = x.id === id)
    return { theme: t, mode: t.mode, colors: t.colors }
  }

  /** 从 JSON 文件导入主题 */
  async importFromFile(filePath?: string): Promise<{ theme: Theme | null; error?: string }> {
    let targetPath = filePath
    if (!targetPath) {
      const result = await dialog.showOpenDialog({
        title: '导入主题',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      })
      if (result.canceled || !result.filePaths.length) return { theme: null, error: '已取消' }
      targetPath = result.filePaths[0]
    }

    try {
      const raw = await readFile(targetPath, 'utf-8')
      const data = JSON.parse(raw)
      if (!data.id || !data.name) return { theme: null, error: '主题文件缺少 id 或 name 字段' }
      if (!data.mode || !['light', 'dark'].includes(data.mode)) return { theme: null, error: '主题文件 mode 必须是 light 或 dark' }
      if (!data.colors || typeof data.colors !== 'object') return { theme: null, error: '主题文件缺少 colors 字段' }

      const theme: Theme = {
        id: data.id, name: data.name, author: data.author || '',
        description: data.description || '', preview: '',
        mode: data.mode as ThemeMode, colors: data.colors,
        source: 'imported', active: false
      }

      // 替换或添加
      const existing = this.themes.findIndex(t => t.id === theme.id)
      if (existing >= 0) {
        if (this.themes[existing].source === 'builtin') return { theme: null, error: '不能覆盖内置主题' }
        this.themes[existing] = theme
      } else {
        this.themes.push(theme)
      }

      await this.persistTheme(theme)
      return { theme }
    } catch (err) {
      return { theme: null, error: `导入失败: ${(err as Error).message}` }
    }
  }

  /** 持久化主题到数据库 */
  private async persistTheme(theme: Theme): Promise<void> {
    try {
      await this.db.run(
        'INSERT OR REPLACE INTO themes (id, name, author, description, mode, colors, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [theme.id, theme.name, theme.author, theme.description, theme.mode, JSON.stringify(theme.colors), theme.source]
      )
    } catch (err) {
      this.logger.warn('持久化主题失败', { id: theme.id, error: err })
    }
  }

  /** 删除已导入的自定义主题 */
  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    const t = this.themes.find(x => x.id === id)
    if (!t) return { ok: false, error: '主题不存在' }
    if (t.source === 'builtin') return { ok: false, error: '不能删除内置主题' }
    if (t.active) return { ok: false, error: '不能删除当前使用的主题' }
    // 从列表移除
    this.themes = this.themes.filter(x => x.id !== id)
    try {
      await this.db.run('DELETE FROM themes WHERE id = ?', [id])
    } catch (err) {
      this.logger.warn('删除主题记录失败', { id, error: err })
    }
    return { ok: true }
  }

  /** 导出主题为 JSON 文件 */
  async exportToFile(id: string): Promise<string | null> {
    const t = this.themes.find(x => x.id === id)
    if (!t) return null
    const result = await dialog.showSaveDialog({
      defaultPath: `${t.name}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (!result.canceled && result.filePath) {
      const exportData = { id: t.id, name: t.name, author: t.author, description: t.description, mode: t.mode, colors: t.colors }
      await writeFile(result.filePath, JSON.stringify(exportData, null, 2))
      return result.filePath
    }
    return null
  }
}
