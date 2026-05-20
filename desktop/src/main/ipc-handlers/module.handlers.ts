/**
 * 模块管理 IPC 处理器
 * module:list / module:enable / module:disable / module:reload
 * + 动态模块能力 IPC 注册/注销
 * + eventBus 事件桥接（theme:changed, on_module_loaded, on_module_unloaded）
 */
import { ipcMain, BrowserWindow } from 'electron'
import { toModuleInfo } from './helpers'
import type { HandlerDeps } from './types'

/** 已手动注册的 IPC 通道集合（防止动态注册覆盖） */
export const registeredModuleIpc = new Set<string>()

/** 模块ID → 该模块注册的 IPC 通道列表，用于禁用时批量注销 */
const moduleIpcChannels = new Map<string, string[]>()

/**
 * 为所有已激活模块的工具能力自动注册 IPC 处理器
 * @param deps - 共享依赖
 */
function registerModuleCapabilities(deps: HandlerDeps): void {
  const { moduleManager, logger } = deps
  if (!moduleManager) return
  const modules = moduleManager.getModules()
  for (const reg of modules) {
    if (!reg.instance) continue
    try {
      const capabilities = reg.instance.getCapabilities()
      const channels: string[] = []
      for (const cap of capabilities) {
        if (cap.type !== 'tool' || !cap.handler) continue
        const channel = cap.name
        if (registeredModuleIpc.has(channel)) continue
        registeredModuleIpc.add(channel)
        channels.push(channel)
        // 记录模块ID和handler的引用，用于动态检查
        const moduleId = reg.meta.id
        const handlerRef = cap.handler
        ipcMain.handle(channel, async (_event, params?: Record<string, unknown>) => {
          // 每次调用时检查模块是否仍处于激活状态
          if (!moduleManager) throw new Error('模块管理器未初始化')
          const currentReg = moduleManager.getModule(moduleId)
          if (!currentReg?.instance || currentReg.status !== 'active') {
            throw new Error(`模块 "${moduleId}" 已禁用，无法调用 ${channel}`)
          }
          try {
            return await handlerRef.execute(params ?? {})
          } catch (err) {
            logger.error(`模块能力调用失败: ${channel}`, err as Error)
            throw err
          }
        })
        logger.debug(`动态注册 IPC: ${channel} (模块: ${moduleId})`)
      }
      moduleIpcChannels.set(reg.meta.id, channels)
    } catch (err) {
      logger.error(`注册模块 ${reg.meta.id} 的能力失败`, err as Error)
    }
  }
  logger.info(`模块能力 IPC 注册完成，共 ${registeredModuleIpc.size} 个处理器`)
}

/**
 * 注销指定模块的所有动态 IPC 处理器
 * @param moduleId - 模块ID
 * @param deps - 共享依赖
 */
function unregisterModuleCapabilities(moduleId: string, deps: HandlerDeps): void {
  const { logger } = deps
  const channels = moduleIpcChannels.get(moduleId)
  if (!channels) return
  for (const channel of channels) {
    ipcMain.removeHandler(channel)
    registeredModuleIpc.delete(channel)
    logger.debug(`动态注销 IPC: ${channel} (模块: ${moduleId})`)
  }
  moduleIpcChannels.delete(moduleId)
  logger.info(`模块 "${moduleId}" 的 ${channels?.length ?? 0} 个 IPC 处理器已注销`)
}

/**
 * 注册模块管理相关 IPC 处理器
 * 包括模块列表、启用/禁用/重载，以及动态能力注册和事件桥接
 * @param deps - 共享依赖
 */
export function registerModuleHandlers(deps: HandlerDeps): void {
  const { config, logger, eventBus, moduleManager } = deps

  registeredModuleIpc.add('module:list')
  registeredModuleIpc.add('module:enable')
  registeredModuleIpc.add('module:disable')
  registeredModuleIpc.add('module:reload')

  /** 获取所有模块列表 */
  ipcMain.handle('module:list', async () => {
    if (!moduleManager) {
      return []
    }
    const modules = moduleManager.getModules()
    const disabledList = await config.get<string[]>('modules.disabled', [])
    return modules.map((reg) => {
      const info = toModuleInfo(reg)
      // 用户偏好优先：不在禁用列表中 = 启用
      const userEnabled = !disabledList.includes(reg.meta.id)
      return { ...info, enabled: userEnabled }
    })
  })

  /** 启用模块 */
  ipcMain.handle('module:enable', async (_event, args: { moduleId: string }) => {
    if (!moduleManager) {
      throw new Error('模块管理器未初始化')
    }
    return moduleManager.enableModule(args.moduleId)
  })

  /** 禁用模块 */
  ipcMain.handle('module:disable', async (_event, args: { moduleId: string }) => {
    if (!moduleManager) {
      throw new Error('模块管理器未初始化')
    }
    return moduleManager.disableModule(args.moduleId)
  })

  /** 热重载模块 */
  ipcMain.handle('module:reload', async (_event, args: { moduleId: string }) => {
    if (!moduleManager) {
      throw new Error('模块管理器未初始化')
    }
    return moduleManager.reloadModule(args.moduleId)
  })

  // 监听模块卸载事件，自动注销 IPC
  eventBus?.on('on_module_unloaded', (data: { moduleId: string }) => {
    unregisterModuleCapabilities(data.moduleId, deps)
  })

  // 监听模块激活事件，自动注册 IPC
  eventBus?.on('on_module_loaded', (data: { moduleId: string }) => {
    setTimeout(() => registerModuleCapabilities(deps), 500)
  })

  // 桥接主题变更事件到渲染进程 + 同步窗口背景色
  eventBus?.on('theme:changed', (data: { themeId: string; mode?: string; colors: Record<string, string> }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('theme:changed', data)
        // 同步原生窗口背景色（标题栏/窗口框架）
        const bgColor = data.colors?.['bg-primary']
        if (bgColor) {
          try { win.setBackgroundColor(bgColor) } catch { /* ignore */ }
        }
      }
    }
  })

  // 模块已加载完成，立即注册所有模块能力的 IPC 处理器
  if (moduleManager) {
    registerModuleCapabilities(deps)
  }
}

/**
 * 通用模块能力调用（供其他 handler 文件使用）
 * @param moduleId - 模块ID
 * @param capabilityName - 能力名称
 * @param params - 调用参数
 * @param deps - 共享依赖
 * @returns 能力执行结果
 */
export async function invokeModuleCapability(moduleId: string, capabilityName: string, params: Record<string, unknown> = {}, deps: HandlerDeps): Promise<unknown> {
  const { moduleManager } = deps
  if (!moduleManager) throw new Error('模块管理器未初始化')
  const reg = moduleManager.getModule(moduleId)
  if (!reg?.instance) throw new Error(`模块 "${moduleId}" 未加载`)
  const capabilities = reg.instance.getCapabilities()
  const cap = capabilities.find((c) => c.name === capabilityName)
  if (!cap?.handler) throw new Error(`能力 ${capabilityName} 不存在`)
  return cap.handler.execute(params)
}
