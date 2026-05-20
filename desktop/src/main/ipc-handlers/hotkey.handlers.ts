/**
 * 全局快捷键 IPC 处理器（兜底）
 * hotkey_register / hotkey_unregister / hotkey_list / window:toggle
 *
 * 与 registeredModuleIpc 完全独立，互不干扰。
 * 本文件只读 registeredModuleIpc（检查模块是否已注册），不写入。
 *
 * 生命周期：
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 启动时                                                          │
 * │   模块先注册 → registeredModuleIpc 有记录 → 兜底跳过           │
 * │                                                                 │
 * │ 模块禁用时                                                      │
 * │   unregisterModuleCapabilities:                                 │
 * │     ipcMain.removeHandler('hotkey_register')                    │
 * │     registeredModuleIpc.delete('hotkey_register')               │
 * │   on_module_unloaded → 兜底检测到模块已注销 → 注册兜底 handler  │
 * │                                                                 │
 * │ 模块重新启用时                                                  │
 * │   on_module_loaded → registerModuleCapabilities:                │
 * │     先 ipcMain.removeHandler('hotkey_register') 移除兜底        │
 * │     再 ipcMain.handle('hotkey_register', 模块handler)           │
 * └─────────────────────────────────────────────────────────────────┘
 */
import { ipcMain, BrowserWindow, globalShortcut } from 'electron'
import { registeredModuleIpc } from './module.handlers'
import type { HandlerDeps } from './types'

/** 已注册的快捷键映射 accelerator → callback */
const registeredHotkeys = new Map<string, () => void>()

/** 本文件已注册的兜底通道 */
const fallbackRegistered = new Set<string>()

/** 本文件负责的兜底通道 */
const FALLBACK_CHANNELS = ['hotkey_register', 'hotkey_unregister', 'hotkey_list', 'window:toggle']

/**
 * 注册兜底 handler
 * - 模块已注册 → 跳过
 * - 兜底已注册 → 跳过
 * - 否则注册
 */
function registerFallbackHandlers(deps: HandlerDeps): void {
  const { logger } = deps

  function safeHandle(channel: string, handler: (...args: unknown[]) => unknown): void {
    if (registeredModuleIpc.has(channel)) return
    if (fallbackRegistered.has(channel)) return
    fallbackRegistered.add(channel)
    ipcMain.handle(channel, handler)
  }

  safeHandle('hotkey_register', async (_event: unknown, args: { accelerator: string; description?: string }) => {
    try {
      const { accelerator } = args
      if (registeredHotkeys.has(accelerator)) {
        globalShortcut.unregister(accelerator)
        registeredHotkeys.delete(accelerator)
      }
      const cb = () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) win.webContents.send('hotkey:triggered', { accelerator })
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

  safeHandle('hotkey_unregister', async (_event: unknown, args: { accelerator: string }) => {
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

  safeHandle('hotkey_list', async () => Array.from(registeredHotkeys.keys()))

  safeHandle('window:toggle', async () => {
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

/**
 * 注册全局快捷键相关 IPC 处理器
 */
export function registerHotkeyHandlers(deps: HandlerDeps): void {
  const { eventBus } = deps

  // 1. 启动时注册（如果模块已注册则跳过）
  registerFallbackHandlers(deps)

  // 2. 模块卸载时：清除兜底标记，重新注册兜底 handler
  eventBus?.on('on_module_unloaded', () => {
    let needRereg = false
    for (const ch of FALLBACK_CHANNELS) {
      if (fallbackRegistered.has(ch) && !registeredModuleIpc.has(ch)) {
        // 兜底标记在但 handler 可能已被 unregisterModuleCapabilities 移除
        fallbackRegistered.delete(ch)
        needRereg = true
      }
    }
    if (needRereg) registerFallbackHandlers(deps)
  })

  // 3. 模块加载时：清除兜底标记（模块会 removeHandler + 重新 handle，覆盖兜底）
  eventBus?.on('on_module_loaded', (data: { moduleId: string }) => {
    // 模块注册时会 ipcMain.removeHandler + ipcMain.handle，兜底 handler 被覆盖
    // 清除标记，这样如果模块再次卸载，兜底可以重新注册
    for (const ch of FALLBACK_CHANNELS) {
      if (fallbackRegistered.has(ch) && registeredModuleIpc.has(ch)) {
        fallbackRegistered.delete(ch)
      }
    }
  })
}
