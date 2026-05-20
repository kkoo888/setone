/**
 * 全局快捷键 IPC 处理器
 * window:toggle（切换窗口显隐）
 *
 * hotkey_register / hotkey_unregister / hotkey_list
 * 已由 desktop-integration 模块通过 registerModuleCapabilities 自动注册，
 * 本文件不再重复注册，避免 "second handler" 报错。
 */
import { ipcMain, BrowserWindow } from 'electron'
import { registeredModuleIpc } from './module.handlers'
import type { HandlerDeps } from './types'

/**
 * 注册全局快捷键相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerHotkeyHandlers(deps: HandlerDeps): void {
  // window:toggle 未被模块注册，需要手动注册
  if (!registeredModuleIpc.has('window:toggle')) {
    registeredModuleIpc.add('window:toggle')
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
}
