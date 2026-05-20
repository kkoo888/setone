/**
 * 轮询注册中心 IPC 处理器
 * polling:register / polling:registerModule / polling:unregister
 * polling:update / polling:tick / polling:list
 */
import { ipcMain } from 'electron'
import { pollingRegistry } from '../core/polling-registry'
import { registeredModuleIpc } from './module.handlers'
import type { HandlerDeps } from './types'

/**
 * 注册轮询注册中心相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerPollingHandlers(_deps: HandlerDeps): void {
  registeredModuleIpc.add('polling:register')
  registeredModuleIpc.add('polling:registerModule')
  registeredModuleIpc.add('polling:unregister')
  registeredModuleIpc.add('polling:update')
  registeredModuleIpc.add('polling:tick')
  registeredModuleIpc.add('polling:list')

  /** 注册核心轮询任务（不绑定模块，常驻） */
  ipcMain.handle('polling:register', async (_event, task) => {
    pollingRegistry.register(task)
    return { success: true }
  })

  /** 注册模块轮询任务（绑定 moduleId，模块 deactivate 时自动清理） */
  ipcMain.handle('polling:registerModule', async (_event, args: { task: Record<string, unknown>; moduleId: string }) => {
    pollingRegistry.registerForModule(args.task as Parameters<typeof pollingRegistry.registerForModule>[0], args.moduleId)
    return { success: true }
  })

  /** 注销轮询任务 */
  ipcMain.handle('polling:unregister', async (_event, args: { id: string }) => {
    pollingRegistry.unregister(args.id)
    return { success: true }
  })

  /** 更新轮询任务状态 */
  ipcMain.handle('polling:update', async (_event, args: { id: string; patch: Record<string, unknown> }) => {
    pollingRegistry.update(args.id, args.patch as Parameters<typeof pollingRegistry.update>[1])
    return { success: true }
  })

  /** 标记轮询任务执行一次，可附带活动描述 */
  ipcMain.handle('polling:tick', async (_event, args: { id: string; activity?: string }) => {
    pollingRegistry.tick(args.id, args.activity)
    return { success: true }
  })

  /** 获取所有轮询任务（初始化用，后续靠推送更新） */
  ipcMain.handle('polling:list', async () => {
    return pollingRegistry.getAll()
  })
}
