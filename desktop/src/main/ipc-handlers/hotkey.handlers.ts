/**
 * 全局快捷键 IPC 处理器
 * hotkey_register / hotkey_unregister / hotkey_list / window:toggle
 */
import { ipcMain, BrowserWindow, globalShortcut } from 'electron'
import type { HandlerDeps } from './types'

/** 已注册的快捷键映射 accelerator → callback */
const registeredHotkeys = new Map<string, () => void>()

/**
 * 注册全局快捷键相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerHotkeyHandlers(deps: HandlerDeps): void {
  const { logger } = deps

  /** 注册全局快捷键（兜底：当 desktop-integration 模块未加载时使用） */
  ipcMain.handle('hotkey_register', async (_event, args: { accelerator: string; description?: string }) => {
    try {
      const { accelerator } = args
      // 如果已注册，先注销
      if (registeredHotkeys.has(accelerator)) {
        globalShortcut.unregister(accelerator)
        registeredHotkeys.delete(accelerator)
      }
      const cb = () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          win.webContents.send('hotkey:triggered', { accelerator })
        }
      }
      globalShortcut.register(accelerator, cb)
      registeredHotkeys.set(accelerator, cb)
      logger.info(`快捷键注册成功: ${accelerator}`)
      return { success: true }
    } catch (err) {
      logger.warn(`快捷键注册失败: ${args.accelerator}`, err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 注销全局快捷键 */
  ipcMain.handle('hotkey_unregister', async (_event, args: { accelerator: string }) => {
    try {
      const { accelerator } = args
      if (registeredHotkeys.has(accelerator)) {
        globalShortcut.unregister(accelerator)
        registeredHotkeys.delete(accelerator)
        logger.info(`快捷键已注销: ${accelerator}`)
      }
      return { success: true }
    } catch (err) {
      logger.warn(`快捷键注销失败: ${args.accelerator}`, err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 列出已注册的快捷键 */
  ipcMain.handle('hotkey_list', async () => {
    return Array.from(registeredHotkeys.keys())
  })

  /** 切换主窗口显示/隐藏 */
  ipcMain.handle('window:toggle', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isVisible() && !win.isMinimized()) {
      win.minimize()
    } else {
      win.restore()
      win.show()
      win.focus()
    }
  })
}
