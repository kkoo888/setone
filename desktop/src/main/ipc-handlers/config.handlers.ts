/**
 * 配置与助手名称 IPC 处理器
 * config:get / config:set / soul:readName
 */
import { ipcMain } from 'electron'
import { readAssistantNameFromSoul } from '../core/soul-reader'
import type { HandlerDeps } from './types'

/**
 * 注册配置相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerConfigHandlers(deps: HandlerDeps): void {
  const { config } = deps

  /** 获取配置值（支持不传 key 返回全部配置） */
  ipcMain.handle('config:get', async (_event, args?: { key?: string; defaultValue?: unknown }) => {
    if (!args?.key) {
      return config.getAll()
    }
    return config.get(args.key, args.defaultValue)
  })

  /** 设置配置值 */
  ipcMain.handle('config:set', async (_event, args: { key: string; value: unknown }) => {
    await config.set(args.key, args.value)
    return true
  })

  /** 从 SOUL.md 读取助手名称 */
  ipcMain.handle('soul:readName', async () => {
    return readAssistantNameFromSoul()
  })
}
