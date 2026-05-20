/**
 * 文件操作 IPC 处理器
 * file:read / file:write / file:list
 */
import { ipcMain } from 'electron'
import { invokeModuleCapability, registeredModuleIpc } from './module.handlers'
import type { HandlerDeps } from './types'

/**
 * 注册文件操作相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerFileHandlers(deps: HandlerDeps): void {
  registeredModuleIpc.add('file:read')
  registeredModuleIpc.add('file:write')
  registeredModuleIpc.add('file:list')

  /** 读取文件 */
  ipcMain.handle('file:read', async (_event, args: { path: string }) => {
    return invokeModuleCapability('file', 'file_read', args, deps)
  })

  /** 写入文件 */
  ipcMain.handle('file:write', async (_event, args: { path: string; content: string }) => {
    return invokeModuleCapability('file', 'file_write', args, deps)
  })

  /** 列出目录 */
  ipcMain.handle('file:list', async (_event, args: { path: string }) => {
    return invokeModuleCapability('file', 'file_list', args, deps)
  })
}
