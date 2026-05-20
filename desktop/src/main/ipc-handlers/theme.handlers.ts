/**
 * 主题管理 IPC 处理器
 * 
 * 提供以下 IPC 通道：
 * - theme_list:    列出所有可用主题
 * - theme_get:     获取指定主题详情
 * - theme_apply:   应用主题（发送 theme:changed 事件）
 * - theme_import:  导入外部主题文件
 * - theme_delete:  删除已导入的主题
 * - theme_export:  导出主题文件
 */
import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { readdir, readFile, writeFile, mkdir, unlink, copyFile } from 'fs/promises'
import { join, extname, basename } from 'path'
import { existsSync } from 'fs'
import { registeredModuleIpc } from './module.handlers'

/** 主题 JSON 结构（兼容 v1 和 v2） */
interface ThemeFile {
  id: string
  name: string
  author: string
  description: string
  mode?: string
  seed?: {
    accent: string
    bg: string
    fg: string
    mode: string
    radius?: number
    fontBase?: number
    spacingBase?: number
  }
  colors?: Record<string, string>
  overrides?: {
    alias?: Record<string, string>
    component?: Record<string, Record<string, string>>
  }
}

/**
 * 获取内置主题目录路径（缓存结果）
 * 开发模式：项目根/themes
 * 打包模式：app.getAppPath()/themes（asar 内）
 */
let _builtinThemesDir: string | null = null
function getBuiltinThemesDir(): string {
  if (_builtinThemesDir) return _builtinThemesDir
  const devPath = join(__dirname, '..', '..', '..', 'themes')
  _builtinThemesDir = existsSync(devPath) ? devPath : join(app.getAppPath(), 'themes')
  return _builtinThemesDir
}

/** 用户导入主题目录 */
const USER_THEMES_DIR: string = join(
  process.env.APPDATA || process.env.HOME || '/tmp',
  '.setone', 'themes'
)

/** 确保用户主题目录存在 */
async function ensureUserDir(): Promise<void> {
  if (!existsSync(USER_THEMES_DIR)) {
    await mkdir(USER_THEMES_DIR, { recursive: true })
  }
}

/** 读取单个主题文件 */
async function readThemeFile(filePath: string): Promise<ThemeFile | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as ThemeFile
  } catch {
    return null
  }
}

/** 从主题文件中提取颜色预览 */
function extractPreviewColors(theme: ThemeFile): Record<string, string> {
  if (theme.seed) {
    // v2 格式：从 seed 派生预览色
    return {
      accent: theme.seed.accent,
      'bg-primary': theme.seed.bg,
      'text-primary': theme.seed.fg,
    }
  }
  if (theme.colors) {
    // v1 格式：直接使用 colors
    return theme.colors
  }
  return {}
}

/** 获取主题的 mode */
function getThemeMode(theme: ThemeFile): string {
  if (theme.seed?.mode) return theme.seed.mode
  if (theme.mode) return theme.mode
  // 从颜色推断
  const bg = theme.seed?.bg || theme.colors?.['bg-primary'] || '#ffffff'
  const lum = getRelativeLuminance(bg)
  return lum > 0.5 ? 'light' : 'dark'
}

/** 简单亮度计算 */
function getRelativeLuminance(hex: string): number {
  try {
    const h = hex.replace('#', '')
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
    const r = ((n >> 16) & 255) / 255
    const g = ((n >> 8) & 255) / 255
    const b = (n & 255) / 255
    const [rs, gs, bs] = [r, g, b].map(c =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    )
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  } catch {
    return 0.5
  }
}

/**
 * 注册主题相关的 IPC 处理器
 */
export function registerThemeHandlers(): void {
  // 标记这些通道已由主进程注册，防止模块系统重复注册
  registeredModuleIpc.add('theme_list')
  registeredModuleIpc.add('theme_get')
  registeredModuleIpc.add('theme_apply')
  registeredModuleIpc.add('theme_import')
  registeredModuleIpc.add('theme_delete')
  registeredModuleIpc.add('theme_export')

  // ── theme_list: 列出所有主题 ──
  ipcMain.handle('theme_list', async () => {
    try {
      const themes: Array<{
        id: string; name: string; author: string; description: string
        mode: string; colors: Record<string, string>; source: string; active: boolean
      }> = []

      // 读取内置主题
      if (existsSync(getBuiltinThemesDir())) {
        const files = await readdir(getBuiltinThemesDir())
        for (const file of files) {
          if (!file.endsWith('.json')) continue
          const theme = await readThemeFile(join(getBuiltinThemesDir(), file))
          if (!theme) continue
          themes.push({
            id: theme.id,
            name: theme.name,
            author: theme.author,
            description: theme.description,
            mode: getThemeMode(theme),
            colors: extractPreviewColors(theme),
            source: 'builtin',
            active: false,
          })
        }
      }

      // 读取用户导入主题
      await ensureUserDir()
      if (existsSync(USER_THEMES_DIR)) {
        const files = await readdir(USER_THEMES_DIR)
        for (const file of files) {
          if (!file.endsWith('.json')) continue
          const theme = await readThemeFile(join(USER_THEMES_DIR, file))
          if (!theme) continue
          themes.push({
            id: theme.id,
            name: theme.name,
            author: theme.author,
            description: theme.description,
            mode: getThemeMode(theme),
            colors: extractPreviewColors(theme),
            source: 'imported',
            active: false,
          })
        }
      }

      return { success: true, data: themes }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── theme_get: 获取指定主题详情 ──
  ipcMain.handle('theme_get', async (_event, params: { id: string }) => {
    try {
      // 先查内置
      const builtinPath = join(getBuiltinThemesDir(), `${params.id}.json`)
      let theme = await readThemeFile(builtinPath)

      // 再查用户
      if (!theme) {
        const userPath = join(USER_THEMES_DIR, `${params.id}.json`)
        theme = await readThemeFile(userPath)
      }

      if (!theme) {
        return { success: false, error: `主题 ${params.id} 不存在` }
      }

      return { success: true, data: theme }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── theme_apply: 应用主题 ──
  ipcMain.handle('theme_apply', async (_event, params: { id: string }) => {
    try {
      // 获取主题数据
      const builtinPath = join(getBuiltinThemesDir(), `${params.id}.json`)
      let theme = await readThemeFile(builtinPath)
      if (!theme) {
        const userPath = join(USER_THEMES_DIR, `${params.id}.json`)
        theme = await readThemeFile(userPath)
      }
      if (!theme) {
        return { success: false, error: `主题 ${params.id} 不存在` }
      }

      // 通知所有渲染进程
      const colors = extractPreviewColors(theme)
      const mode = getThemeMode(theme)
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('theme:changed', {
            themeId: theme.id,
            mode,
            colors,
            themeData: theme,  // 完整主题数据，渲染进程用
          })
        }
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── theme_import: 导入主题文件 ──
  ipcMain.handle('theme_import', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { success: false, error: '无法获取窗口' }

      const result = await dialog.showOpenDialog(win, {
        title: '导入主题',
        filters: [{ name: '主题文件', extensions: ['json'] }],
        properties: ['openFile'],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '已取消' }
      }

      const filePath = result.filePaths[0]
      const theme = await readThemeFile(filePath)
      if (!theme) {
        return { success: false, error: '无效的主题文件' }
      }

      // 确保有 ID
      if (!theme.id) {
        (theme as { id?: string }).id = basename(filePath, extname(filePath))
      }

      // 复制到用户主题目录
      await ensureUserDir()
      const destPath = join(USER_THEMES_DIR, `${theme.id}.json`)
      await writeFile(destPath, JSON.stringify(theme, null, 2), 'utf-8')

      return { success: true, data: theme }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── theme_delete: 删除用户主题 ──
  ipcMain.handle('theme_delete', async (_event, params: { id: string }) => {
    try {
      const userPath = join(USER_THEMES_DIR, `${params.id}.json`)
      if (!existsSync(userPath)) {
        return { success: false, error: '主题不存在' }
      }
      await unlink(userPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── theme_export: 导出主题文件 ──
  ipcMain.handle('theme_export', async (event, params: { id: string }) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { success: false, error: '无法获取窗口' }

      // 查找主题
      const builtinPath = join(getBuiltinThemesDir(), `${params.id}.json`)
      let themePath = existsSync(builtinPath) ? builtinPath : null
      if (!themePath) {
        const userPath = join(USER_THEMES_DIR, `${params.id}.json`)
        themePath = existsSync(userPath) ? userPath : null
      }
      if (!themePath) {
        return { success: false, error: '主题不存在' }
      }

      const result = await dialog.showSaveDialog(win, {
        title: '导出主题',
        defaultPath: `${params.id}.json`,
        filters: [{ name: '主题文件', extensions: ['json'] }],
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: '已取消' }
      }

      await copyFile(themePath, result.filePath)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
