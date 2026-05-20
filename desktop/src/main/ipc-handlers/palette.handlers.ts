/**
 * 命令面板 IPC 处理器
 * palette:search / palette:execute / palette:open / palette:close
 */
import { ipcMain } from 'electron'
import { invokeModuleCapability, registeredModuleIpc } from './module.handlers'
import type { HandlerDeps } from './types'

/**
 * 注册命令面板相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerPaletteHandlers(deps: HandlerDeps): void {
  registeredModuleIpc.add('palette:search')
  registeredModuleIpc.add('palette:execute')
  registeredModuleIpc.add('palette:open')
  registeredModuleIpc.add('palette:close')

  /** 搜索命令 */
  ipcMain.handle('palette:search', async (_event, args: { query?: string }) => {
    try {
      return await invokeModuleCapability('command-palette', 'palette_search', args ?? {}, deps)
    } catch {
      return []
    }
  })

  /** 执行命令 */
  ipcMain.handle('palette:execute', async (_event, args: { commandId: string }) => {
    try {
      return await invokeModuleCapability('command-palette', 'palette_execute', args, deps)
    } catch (err) {
      throw err
    }
  })

  /** 打开命令面板 */
  ipcMain.handle('palette:open', async (_event, args?: { query?: string }) => {
    try {
      return await invokeModuleCapability('command-palette', 'palette_open', args ?? {}, deps)
    } catch {
      return { success: false }
    }
  })

  /** 关闭命令面板 */
  ipcMain.handle('palette:close', async () => {
    try {
      return await invokeModuleCapability('command-palette', 'palette_close', {}, deps)
    } catch {
      return { success: false }
    }
  })
}
