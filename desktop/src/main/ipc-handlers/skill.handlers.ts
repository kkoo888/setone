/**
 * 技能系统 IPC 处理器
 * 所有 skill:* 相关 IPC 通道
 */
import { ipcMain } from 'electron'
import { registeredModuleIpc } from './module.handlers'
import type { HandlerDeps } from './types'

/**
 * 调用技能模块的能力
 * @param capabilityName - 能力名称
 * @param params - 调用参数
 * @param deps - 共享依赖
 * @returns 能力执行结果
 */
async function invokeSkillCapability(capabilityName: string, params: Record<string, unknown> = {}, deps: HandlerDeps): Promise<unknown> {
  const { moduleManager } = deps
  if (!moduleManager) throw new Error('模块管理器未初始化')
  const reg = moduleManager.getModule('skill')
  if (!reg?.instance) throw new Error('技能模块未加载')
  const capabilities = reg.instance.getCapabilities()
  const cap = capabilities.find((c) => c.name === capabilityName)
  if (!cap?.handler) throw new Error(`能力 ${capabilityName} 不存在`)
  const result = await cap.handler.execute(params)
  return result
}

/** 检查网络是否允许访问，断网时返回 false */
async function assertNetworkAllowed(deps: HandlerDeps): Promise<boolean> {
  const { config, logger } = deps
  const enabled = await config.get('appSettings.networkEnabled', true)
  if (!enabled) {
    logger.warn('[NetworkGuard] 网络已断开，外网请求被拦截')
  }
  return enabled as boolean
}

/**
 * 注册技能系统相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerSkillHandlers(deps: HandlerDeps): void {
  const { logger } = deps

  registeredModuleIpc.add('skill:list')
  registeredModuleIpc.add('skill:discover')
  registeredModuleIpc.add('skill:toggle')
  registeredModuleIpc.add('skill:create')
  registeredModuleIpc.add('skill:refine')
  registeredModuleIpc.add('skill:delete')
  registeredModuleIpc.add('skill:scan')
  registeredModuleIpc.add('skill:config')
  registeredModuleIpc.add('skill:trash:list')
  registeredModuleIpc.add('skill:trash:restore')
  registeredModuleIpc.add('skill:trash:empty')
  registeredModuleIpc.add('skill:trash:delete')
  registeredModuleIpc.add('skill:stats')
  registeredModuleIpc.add('skill:export')
  registeredModuleIpc.add('skill:import')
  registeredModuleIpc.add('skill:export:batch')
  registeredModuleIpc.add('skill:import:batch')
  registeredModuleIpc.add('skill:market:search')
  registeredModuleIpc.add('skill:market:install')
  registeredModuleIpc.add('skill:install:url')
  registeredModuleIpc.add('skill:update:check')
  registeredModuleIpc.add('skill:update:run')

  /** 获取全部技能列表 */
  ipcMain.handle('skill:list', async () => {
    try {
      return await invokeSkillCapability('skill_list', {}, deps)
    } catch (err) {
      logger.warn('获取技能列表失败', err as Error)
      return []
    }
  })

  /** 重新扫描技能目录 */
  ipcMain.handle('skill:discover', async (_event, args: { dirs: string[] }) => {
    try {
      return await invokeSkillCapability('skill_discover', args, deps)
    } catch (err) {
      logger.warn('技能发现失败', err as Error)
      return { discovered: 0 }
    }
  })

  /** 激活/停用技能 */
  ipcMain.handle('skill:toggle', async (_event, args: { id: string; active: boolean }) => {
    try {
      return await invokeSkillCapability('skill_toggle', args, deps)
    } catch (err) {
      logger.warn('技能切换失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 创建新技能 */
  ipcMain.handle('skill:create', async (_event, args: Record<string, unknown>) => {
    try {
      return await invokeSkillCapability('skill_create', args, deps)
    } catch (err) {
      logger.warn('创建技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 炼化优化技能 */
  ipcMain.handle('skill:refine', async (_event, args: { id: string; instruction: string }) => {
    try {
      return await invokeSkillCapability('skill_refine', args, deps)
    } catch (err) {
      logger.warn('炼化技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 删除技能 */
  ipcMain.handle('skill:delete', async (_event, args: { id: string }) => {
    try {
      return await invokeSkillCapability('skill_delete', args, deps)
    } catch (err) {
      logger.warn('删除技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 安装前扫描 */
  ipcMain.handle('skill:scan', async (_event, args: { path: string }) => {
    try {
      return await invokeSkillCapability('skill_scan', args, deps)
    } catch (err) {
      logger.warn('技能扫描失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 获取/更新技能配置 */
  ipcMain.handle('skill:config', async (_event, args: { id: string; config?: Record<string, unknown> }) => {
    try {
      return await invokeSkillCapability('skill_config', args, deps)
    } catch (err) {
      logger.warn('技能配置操作失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 获取回收站列表 */
  ipcMain.handle('skill:trash:list', async () => {
    try {
      return await invokeSkillCapability('skill_trash_list', {}, deps)
    } catch (err) {
      logger.warn('获取回收站列表失败', err as Error)
      return { success: false, data: [] }
    }
  })

  /** 从回收站恢复技能 */
  ipcMain.handle('skill:trash:restore', async (_event, args: { id: string }) => {
    try {
      return await invokeSkillCapability('skill_trash_restore', args, deps)
    } catch (err) {
      logger.warn('恢复技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 清空回收站 */
  ipcMain.handle('skill:trash:empty', async () => {
    try {
      return await invokeSkillCapability('skill_trash_empty', {}, deps)
    } catch (err) {
      logger.warn('清空回收站失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 永久删除回收站中的技能 */
  ipcMain.handle('skill:trash:delete', async (_event, args: { id: string }) => {
    try {
      return await invokeSkillCapability('skill_trash_delete', args, deps)
    } catch (err) {
      logger.warn('永久删除技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 获取技能统计 */
  ipcMain.handle('skill:stats', async (_event, args?: { id?: string }) => {
    try {
      return await invokeSkillCapability('skill_stats', args ?? {}, deps)
    } catch (err) {
      logger.warn('获取技能统计失败', err as Error)
      return { success: true, data: [] }
    }
  })

  /** 导出单个技能 */
  ipcMain.handle('skill:export', async (_event, args: { id: string; outputPath?: string }) => {
    try {
      return await invokeSkillCapability('skill_export', args, deps)
    } catch (err) {
      logger.warn('技能导出失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 导入单个技能 */
  ipcMain.handle('skill:import', async (_event, args: { archivePath: string }) => {
    try {
      return await invokeSkillCapability('skill_import', args, deps)
    } catch (err) {
      logger.warn('技能导入失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 批量导出技能 */
  ipcMain.handle('skill:export:batch', async (_event, args: { ids: string[] }) => {
    try {
      return await invokeSkillCapability('skill_export_batch', args, deps)
    } catch (err) {
      logger.warn('批量导出失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 批量导入技能 */
  ipcMain.handle('skill:import:batch', async (_event, args: { archivePath: string }) => {
    try {
      return await invokeSkillCapability('skill_import_batch', args, deps)
    } catch (err) {
      logger.warn('批量导入失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 搜索市场技能 */
  ipcMain.handle('skill:market:search', async (_event, args: { query: string }) => {
    if (!(await assertNetworkAllowed(deps))) return []
    try {
      return await invokeSkillCapability('skill_market_search', args, deps)
    } catch (err) {
      logger.warn('市场搜索失败', err as Error)
      return []
    }
  })

  /** 从市场安装技能 */
  ipcMain.handle('skill:market:install', async (_event, args: { skillId: string }) => {
    if (!(await assertNetworkAllowed(deps))) return { success: false, error: '网络已断开' }
    try {
      return await invokeSkillCapability('skill_market_install', args, deps)
    } catch (err) {
      logger.warn('市场安装失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 从 URL 安装技能 */
  ipcMain.handle('skill:install:url', async (_event, args: { url: string }) => {
    if (!(await assertNetworkAllowed(deps))) return { success: false, error: '网络已断开' }
    try {
      return await invokeSkillCapability('skill_install_url', args, deps)
    } catch (err) {
      logger.warn('URL 安装失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 检查技能更新 */
  ipcMain.handle('skill:update:check', async () => {
    if (!(await assertNetworkAllowed(deps))) return []
    try {
      return await invokeSkillCapability('skill_update_check', {}, deps)
    } catch (err) {
      logger.warn('检查更新失败', err as Error)
      return []
    }
  })

  /** 更新技能 */
  ipcMain.handle('skill:update:run', async (_event, args: { skillId: string }) => {
    if (!(await assertNetworkAllowed(deps))) return { success: false, error: '网络已断开' }
    try {
      return await invokeSkillCapability('skill_update_run', args, deps)
    } catch (err) {
      logger.warn('更新技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })
}
