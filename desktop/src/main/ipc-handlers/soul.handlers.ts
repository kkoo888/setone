/**
 * SOUL 人格系统 IPC 处理器
 * soul:initialize / soul:get / soul:create / soul:update / soul:reset
 */
import { ipcMain } from 'electron'
import { SoulManager } from '../core/soul-manager'
import type { HandlerDeps } from './types'

/** 获取 SoulManager 单例 */
const soulManagerInstance = SoulManager.getInstance()

/**
 * 获取 SoulManager 实例
 * @returns SoulManager 实例
 */
function getSoulManager() {
  return soulManagerInstance
}

/**
 * 注册 SOUL 人格系统相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerSoulHandlers(_deps: HandlerDeps): void {
  /** 初始化 SOUL（检查本地配置或继承 SOUL.md） */
  ipcMain.handle('soul:initialize', async () => {
    const sm = await getSoulManager()
    const status = sm.initialize()
    return { status, soul: sm.getSoul() }
  })

  /** 获取当前 SOUL 配置 */
  ipcMain.handle('soul:get', async () => {
    const sm = await getSoulManager()
    return sm.getSoul()
  })

  /** 创建 SOUL（首次引导完成后调用） */
  ipcMain.handle('soul:create', async (_event, request) => {
    const sm = await getSoulManager()
    return sm.createSoul(request as import('../../shared/types/soul').SoulCreateRequest)
  })

  /** 更新 SOUL 配置 */
  ipcMain.handle('soul:update', async (_event, updates) => {
    const sm = await getSoulManager()
    return sm.updateSoul(updates as Partial<import('../../shared/types/soul').SoulCreateRequest>)
  })

  /** 重置 SOUL（删除配置，重新引导） */
  ipcMain.handle('soul:reset', async () => {
    const sm = await getSoulManager()
    sm.resetSoul()
    return { success: true }
  })
}
