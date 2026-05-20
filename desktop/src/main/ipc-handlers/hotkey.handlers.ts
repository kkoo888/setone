/**
 * 全局快捷键 IPC 处理器（兜底）
 * hotkey_register / hotkey_unregister / hotkey_list / window:toggle
 *
 * 设计逻辑：
 * 1. 启动时：模块先注册 → 本文件检测到已注册则跳过，不重复注册
 * 2. 模块禁用时：模块 handler 被移除 → 监听 on_module_unloaded，补注册兜底 handler
 * 3. 模块重新启用时：模块再次注册 → 兜底 handler 仍在但不影响（模块优先）
 */
import { ipcMain, BrowserWindow, globalShortcut } from 'electron'
import { registeredModuleIpc } from './module.handlers'
import type { HandlerDeps } from './types'

/** 已注册的快捷键映射 accelerator → callback */
const registeredHotkeys = new Map<string, () => void>()

/** 本文件负责的兜底通道 */
const FALLBACK_CHANNELS = ['hotkey_register', 'hotkey_unregister', 'hotkey_list', 'window:toggle']

/**
 * 安全注册 IPC handler（如果通道已注册则跳过）
 * @returns true=已注册, false=跳过（模块已注册）
 */
function safeHandle(channel: string, handler: (...args: unknown[]) => unknown): boolean {
  if (registeredModuleIpc.has(channel)) return false
  registeredModuleIpc.add(channel)
  ipcMain.handle(channel, handler)
  return true
}

/**
 * 注册兜底 handler（用于模块禁用后接管）
 */
function registerFallbackHandlers(deps: HandlerDeps): void {
  const { logger } = deps

  safeHandle('hotkey_register', async (_event: unknown, args: { accelerator: string; description?: string }) => {
    try {
      const { accelerator } = args
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

  safeHandle('hotkey_list', async () => {
    return Array.from(registeredHotkeys.keys())
  })

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
 * @param deps - 共享依赖
 */
export function registerHotkeyHandlers(deps: HandlerDeps): void {
  const { eventBus } = deps

  // 1. 启动时注册（如果模块已注册则跳过）
  registerFallbackHandlers(deps)

  // 2. 监听模块卸载事件，补注册兜底 handler
  eventBus?.on('on_module_unloaded', (data: { moduleId: string }) => {
    // 检查是否有兜底通道被模块注销了，补回来
    for (const ch of FALLBACK_CHANNELS) {
      if (!registeredModuleIpc.has(ch)) {
        registerFallbackHandlers(deps)
        return
      }
    }
  })
}
