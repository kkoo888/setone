/**
 * IPC 处理器注册
 * 处理渲染进程的 invoke 请求
 */
import { ipcMain, BrowserWindow, dialog, globalShortcut } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { readdir, stat, readFile } from 'node:fs/promises'
import type { ConfigManager } from './types/config'
import type { Logger } from './types/logger'
import type { ModuleRegistration, ModuleInfo } from './types/module'
import type { GlobalEventBus } from './core/event-bus'
import type { OllamaAIService } from './core/ai-service'
import type { DatabaseManager as ConcreteDatabaseManager } from './core/database'
import type { ModuleManager } from './core/module-manager'
import type { PerformanceMonitor } from './core/performance-monitor'
import type { ToolDefinition, ToolCall } from './types/ai'
import { getToolParamSchema } from './core/tool-param-schemas'
import { SoulManager } from './core/soul-manager'
import { readAssistantNameFromSoul } from './core/soul-reader'

/** Ollama 模型信息 */
interface OllamaModel {
  readonly name: string
  readonly size: number
  readonly modified: string
}

/**
 * 将模块注册状态映射为前端模块状态
 * @param status - 模块注册状态
 * @returns 前端可用的模块状态字符串
 *
 * 前端期望: 'discovered' | 'loading' | 'active' | 'disabled' | 'error'
 * 后端 ModuleRegistrationStatus: 'discovered' | 'loading' | 'active' | 'error' | 'disabled' | 'incompatible'
 */
function mapModuleStatus(status: ModuleRegistration['status']): string {
  const mapping: Record<ModuleRegistration['status'], string> = {
    discovered: 'discovered',
    loading: 'loading',
    active: 'active',
    error: 'error',
    disabled: 'disabled',
    incompatible: 'error'
  }
  return mapping[status]
}

/**
 * 将 ModuleRegistration 转换为前端 ModuleInfo 格式
 * @param reg - 模块注册信息
 * @returns 前端友好的模块信息
 */
function toModuleInfo(reg: ModuleRegistration): ModuleInfo {
  return {
    id: reg.meta.id,
    name: reg.meta.name,
    description: reg.meta.description,
    version: reg.meta.version,
    author: reg.meta.author,
    status: mapModuleStatus(reg.status),
    enabled: reg.status === 'active',
    icon: '',
    dependencies: reg.meta.dependencies,
    hostVersion: reg.meta.hostVersion,
    priority: reg.meta.priority,
    resourceLimits: reg.meta.resourceLimits,
    provides: reg.meta.provides,
    consumes: reg.meta.consumes,
    settings: reg.meta.settings,
    lastUpdated: new Date().toISOString()
  }
}

/**
 * 注册所有 IPC 处理器
 * @param config - 配置管理器实例
 * @param logger - 日志实例
 * @param eventBus - 事件总线（可选）
 * @param aiService - AI 服务（可选）
 * @param db - 数据库管理器（可选）
 * @param moduleManager - 模块管理器（可选）
 * @param performanceMonitor - 性能监控器（可选）
 */
export function registerIpcHandlers(
  config: ConfigManager,
  logger: Logger,
  eventBus?: GlobalEventBus,
  aiService?: OllamaAIService,
  db?: ConcreteDatabaseManager,
  moduleManager?: ModuleManager,
  performanceMonitor?: PerformanceMonitor
): void {
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

  /** 获取 Ollama 已安装的模型列表 */
  ipcMain.handle('ollama:listModels', async () => {
    const baseUrl = await config.get('ollama.baseUrl', 'http://localhost:11434')
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) {
        logger.warn(`Ollama 模型列表请求失败: ${response.status}`)
        return { success: false, models: [] as OllamaModel[] }
      }
      const data = await response.json() as { models?: OllamaModel[] }
      return { success: true, models: data.models ?? [] }
    } catch (err) {
      logger.warn('无法连接 Ollama 获取模型列表', err as Error)
      return { success: false, models: [] as OllamaModel[] }
    }
  })

  /** 获取系统资源快照（用于状态栏） */
  ipcMain.handle('performance:snapshot', async () => {
    try {
      const os = await import('os')
      const cpus = os.cpus()
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const usedMem = totalMem - freeMem

      // 计算 CPU 使用率
      const cpuUsage = cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
        const idle = cpu.times.idle
        return acc + ((total - idle) / total) * 100
      }, 0) / cpus.length

      return {
        cpu: Math.round(cpuUsage * 10) / 10,
        memory: Math.round((usedMem / totalMem) * 1000) / 10,
        memoryUsedMB: Math.round(usedMem / 1024 / 1024),
        memoryTotalMB: Math.round(totalMem / 1024 / 1024)
      }
    } catch {
      return { cpu: 0, memory: 0, memoryUsedMB: 0, memoryTotalMB: 0 }
    }
  })

  /** AI 非流式对话（支持工具调用） */
  ipcMain.handle('ai:chat', async (_event, args: { messages: Array<{ role: string; content: string; images?: string[] }> }) => {
    if (!aiService) throw new Error('AI 服务未初始化')

    const messages = args.messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      ...(m.images ? { images: m.images } : {})
    }))

    const tools = collectModuleTools()
    const allToolCalls: Array<{ id: string; name: string; arguments?: Record<string, unknown>; result?: unknown; error?: string; status: 'running' | 'success' | 'error'; durationMs?: number }> = []

    try {
      // 带工具的对话循环：LLM 可能返回多个 tool_calls
      let result = await aiService.chat(messages, { tools: tools.length > 0 ? tools : undefined })
      let maxRounds = 5 // 防止无限循环

      while (result.message?.tool_calls?.length && maxRounds > 0) {
        maxRounds--
        // 1. 把 assistant 的 tool_calls 消息加入历史
        messages.push(result.message)

        // 2. 逐个执行工具调用
        for (const toolCall of result.message.tool_calls) {
          allToolCalls.push({ id: toolCall.id, name: toolCall.function.name, arguments: undefined, status: 'running', durationMs: 0 })
          const toolResult = await executeToolCall(toolCall)
          // 更新状态
          const idx = allToolCalls.findIndex(t => t.id === toolCall.id)
          if (idx >= 0) {
            allToolCalls[idx] = { ...allToolCalls[idx], result: toolResult.result, error: toolResult.error, status: toolResult.status, durationMs: toolResult.durationMs }
          }
          // 3. 把工具结果作为 tool role 消息加入历史
          messages.push({
            role: 'tool' as const,
            content: JSON.stringify(toolResult.result ?? toolResult.error ?? '无结果'),
            tool_call_id: toolCall.id
          })
        }

        // 4. 再次请求 LLM（带工具结果）
        result = await aiService.chat(messages, { tools: tools.length > 0 ? tools : undefined })
      }

      return { response: result.message?.content ?? '', toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined }
    } catch (err) {
      throw new Error(`AI 对话失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  /** AI 流式对话（支持工具调用） */
  ipcMain.handle('ai:chatStream', async (event, args: { requestId: string; messages: Array<{ role: string; content: string; images?: string[] }> }) => {
    const { requestId, messages } = args
    const mainWindow = BrowserWindow.fromWebContents(event.sender)

    if (!aiService) {
      mainWindow?.webContents.send(`ai:chatStream:error:${requestId}`, { error: 'AI 服务未初始化' })
      return
    }

    const chatMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      ...(m.images ? { images: m.images } : {})
    }))

    const tools = collectModuleTools()
    let maxRounds = 5 // 防止无限循环

    try {
      while (maxRounds > 0) {
        maxRounds--
        let toolCallsInRound: ToolCall[] = []
        let roundContent = ''

        // 流式请求
        for await (const chunk of aiService.chatStream(chatMessages, { tools: tools.length > 0 ? tools : undefined })) {
          if (chunk.message?.content) {
            roundContent += chunk.message.content
            mainWindow?.webContents.send(`ai:chatStream:chunk:${requestId}`, {
              content: chunk.message.content
            })
          }
          if (chunk.message?.tool_calls) {
            toolCallsInRound.push(...chunk.message.tool_calls)
          }
          if (chunk.done) break
        }

        // 如果没有工具调用，结束循环
        if (toolCallsInRound.length === 0) {
          mainWindow?.webContents.send(`ai:chatStream:done:${requestId}`)
          return
        }

        // 有工具调用：执行工具并继续
        // 把 assistant 消息（含 tool_calls）加入历史
        chatMessages.push({
          role: 'assistant' as const,
          content: roundContent,
          tool_calls: toolCallsInRound
        })

        for (const toolCall of toolCallsInRound) {
          // 通知前端工具正在执行
          mainWindow?.webContents.send(`ai:chatStream:chunk:${requestId}`, {
            toolCall: { name: toolCall.function.name, status: 'running' }
          })

          const toolResult = await executeToolCall(toolCall)

          // 通知前端工具执行结果
          mainWindow?.webContents.send(`ai:chatStream:chunk:${requestId}`, {
            toolCall: {
              name: toolCall.function.name,
              arguments: typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments,
              result: toolResult.result,
              error: toolResult.error,
              status: toolResult.status,
              durationMs: toolResult.durationMs
            }
          })

          // 把工具结果加入消息历史
          chatMessages.push({
            role: 'tool' as const,
            content: JSON.stringify(toolResult.result ?? toolResult.error ?? '无结果'),
            tool_call_id: toolCall.id
          })
        }

        // 继续循环，让 LLM 处理工具结果
      }

      // 循环结束（超过最大轮次）
      mainWindow?.webContents.send(`ai:chatStream:done:${requestId}`)
    } catch (err) {
      mainWindow?.webContents.send(`ai:chatStream:error:${requestId}`, {
        error: err instanceof Error ? err.message : String(err)
      })
    }
  })

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

  // ============================================================
  // 动态模块能力 IPC 注册
  // 为所有已激活模块的工具能力自动注册 IPC 处理器
  // ============================================================
  const registeredModuleIpc = new Set<string>()

  /** 模块ID → 该模块注册的 IPC 通道列表，用于禁用时批量注销 */
  const moduleIpcChannels = new Map<string, string[]>()

  function registerModuleCapabilities(): void {
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

  /** 注销指定模块的所有动态 IPC 处理器 */
  function unregisterModuleCapabilities(moduleId: string): void {
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

  // 监听模块卸载事件，自动注销 IPC
  eventBus?.on('on_module_unloaded', (data: { moduleId: string }) => {
    unregisterModuleCapabilities(data.moduleId)
  })

  // 监听模块激活事件，自动注册 IPC
  eventBus?.on('on_module_loaded', (data: { moduleId: string }) => {
    setTimeout(() => registerModuleCapabilities(), 500)
  })

  // 模块已加载完成，立即注册所有模块能力的 IPC 处理器
  if (moduleManager) {
    registerModuleCapabilities()
  }

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

  // ========== 技能模块 IPC ==========

  /**
   * 调用技能模块的能力
   * @param capabilityName - 能力名称
   * @param params - 调用参数
   * @returns 能力执行结果
   */
  async function invokeSkillCapability(capabilityName: string, params: Record<string, unknown> = {}): Promise<unknown> {
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
  async function assertNetworkAllowed(): Promise<boolean> {
    const enabled = await config.get('appSettings.networkEnabled', true)
    if (!enabled) {
      logger.warn('[NetworkGuard] 网络已断开，外网请求被拦截')
    }
    return enabled as boolean
  }

  /** 通用模块能力调用 */
  async function invokeModuleCapability(moduleId: string, capabilityName: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!moduleManager) throw new Error('模块管理器未初始化')
    const reg = moduleManager.getModule(moduleId)
    if (!reg?.instance) throw new Error(`模块 "${moduleId}" 未加载`)
    const capabilities = reg.instance.getCapabilities()
    const cap = capabilities.find((c) => c.name === capabilityName)
    if (!cap?.handler) throw new Error(`能力 ${capabilityName} 不存在`)
    return cap.handler.execute(params)
  }

  /**
   * 从所有活跃模块中收集工具定义
   * 将模块的 tool 类型能力转换为 Ollama ToolDefinition 格式
   */
  function collectModuleTools(): ToolDefinition[] {
    if (!moduleManager) return []
    const tools: ToolDefinition[] = []
    const modules = moduleManager.getModules()

    for (const reg of modules) {
      if (reg.status !== 'active' || !reg.instance) continue
      try {
        const capabilities = reg.instance.getCapabilities()
        for (const cap of capabilities) {
          if (cap.type !== 'tool' || !cap.handler) continue
          // 跳过内部工具和统计类工具，不暴露给 LLM
          if (cap.name.startsWith('skill_') && !['skill_list', 'skill_create', 'skill_refine', 'skill_refine_analyze'].includes(cap.name)) continue
          // 跳过元工具（工具注册/路由等），避免循环调用
          if (['tool_register', 'tool_execute', 'tool_list', 'tool_route'].includes(cap.name)) continue

          // 优先级：模块自定义参数 > 静态映射表 > 空 schema
          tools.push({
            type: 'function',
            function: {
              name: cap.name,
              description: cap.description || `模块 ${reg.meta.id} 的 ${cap.name} 能力`,
              parameters: cap.parameters ?? getToolParamSchema(cap.name)
            }
          })
        }
      } catch {
        // 模块能力收集失败，跳过
      }
    }
    return tools
  }

  /**
   * 执行工具调用
   * 根据 tool_call 的 function name 找到对应模块能力并执行
   */
  async function executeToolCall(toolCall: ToolCall): Promise<{ id: string; name: string; result: unknown; error?: string; status: 'success' | 'error'; durationMs: number }> {
    const startTime = Date.now()
    const { name, arguments: argsRaw } = toolCall.function
    let params: Record<string, unknown> = {}
    try {
      params = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw
    } catch {
      // 参数解析失败，使用空对象
    }

    if (!moduleManager) {
      return { id: toolCall.id, name, result: null, error: '模块管理器未初始化', status: 'error', durationMs: Date.now() - startTime }
    }

    // 遍历所有模块查找匹配的能力
    for (const reg of moduleManager.getModules()) {
      if (reg.status !== 'active' || !reg.instance) continue
      const caps = reg.instance.getCapabilities()
      const cap = caps.find((c) => c.name === name && c.type === 'tool' && c.handler)
      if (cap?.handler) {
        try {
          const result = await cap.handler.execute(params)
          return { id: toolCall.id, name, result, status: 'success', durationMs: Date.now() - startTime }
        } catch (err) {
          return { id: toolCall.id, name, result: null, error: (err as Error).message, status: 'error', durationMs: Date.now() - startTime }
        }
      }
    }

    return { id: toolCall.id, name, result: null, error: `工具 "${name}" 未找到`, status: 'error', durationMs: Date.now() - startTime }
  }

  // ============================================================
  // 文件操作 IPC
  // ============================================================
  ipcMain.handle('file:read', async (_event, args: { path: string }) => {
    return invokeModuleCapability('file', 'file_read', args)
  })
  ipcMain.handle('file:write', async (_event, args: { path: string; content: string }) => {
    return invokeModuleCapability('file', 'file_write', args)
  })
  ipcMain.handle('file:list', async (_event, args: { path: string }) => {
    return invokeModuleCapability('file', 'file_list', args)
  })

  // ============================================================
  // 命令面板 IPC
  // ============================================================
  ipcMain.handle('palette:search', async (_event, args: { query?: string }) => {
    try {
      return await invokeModuleCapability('command-palette', 'palette_search', args ?? {})
    } catch {
      return []
    }
  })
  ipcMain.handle('palette:execute', async (_event, args: { commandId: string }) => {
    try {
      return await invokeModuleCapability('command-palette', 'palette_execute', args)
    } catch (err) {
      throw err
    }
  })
  ipcMain.handle('palette:open', async (_event, args?: { query?: string }) => {
    try {
      return await invokeModuleCapability('command-palette', 'palette_open', args ?? {})
    } catch {
      return { success: false }
    }
  })
  ipcMain.handle('palette:close', async () => {
    try {
      return await invokeModuleCapability('command-palette', 'palette_close', {})
    } catch {
      return { success: false }
    }
  })

  // ============================================================
  // 技能系统 IPC
  // ============================================================

  /** 获取全部技能列表 */
  ipcMain.handle('skill:list', async () => {
    try {
      return await invokeSkillCapability('skill_list')
    } catch (err) {
      logger.warn('获取技能列表失败', err as Error)
      return []
    }
  })

  /** 重新扫描技能目录 */
  ipcMain.handle('skill:discover', async (_event, args: { dirs: string[] }) => {
    try {
      return await invokeSkillCapability('skill_discover', args)
    } catch (err) {
      logger.warn('技能发现失败', err as Error)
      return { discovered: 0 }
    }
  })

  /** 激活/停用技能 */
  ipcMain.handle('skill:toggle', async (_event, args: { id: string; active: boolean }) => {
    try {
      return await invokeSkillCapability('skill_toggle', args)
    } catch (err) {
      logger.warn('技能切换失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 创建新技能 */
  ipcMain.handle('skill:create', async (_event, args: Record<string, unknown>) => {
    try {
      return await invokeSkillCapability('skill_create', args)
    } catch (err) {
      logger.warn('创建技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 炼化优化技能 */
  ipcMain.handle('skill:refine', async (_event, args: { id: string; instruction: string }) => {
    try {
      return await invokeSkillCapability('skill_refine', args)
    } catch (err) {
      logger.warn('炼化技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 删除技能 */
  ipcMain.handle('skill:delete', async (_event, args: { id: string }) => {
    try {
      return await invokeSkillCapability('skill_delete', args)
    } catch (err) {
      logger.warn('删除技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 安装前扫描 */
  ipcMain.handle('skill:scan', async (_event, args: { path: string }) => {
    try {
      return await invokeSkillCapability('skill_scan', args)
    } catch (err) {
      logger.warn('技能扫描失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 获取/更新技能配置 */
  ipcMain.handle('skill:config', async (_event, args: { id: string; config?: Record<string, unknown> }) => {
    try {
      return await invokeSkillCapability('skill_config', args)
    } catch (err) {
      logger.warn('技能配置操作失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 获取回收站列表 */
  ipcMain.handle('skill:trash:list', async () => {
    try {
      return await invokeSkillCapability('skill_trash_list')
    } catch (err) {
      logger.warn('获取回收站列表失败', err as Error)
      return { success: false, data: [] }
    }
  })

  /** 从回收站恢复技能 */
  ipcMain.handle('skill:trash:restore', async (_event, args: { id: string }) => {
    try {
      return await invokeSkillCapability('skill_trash_restore', args)
    } catch (err) {
      logger.warn('恢复技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 清空回收站 */
  ipcMain.handle('skill:trash:empty', async () => {
    try {
      return await invokeSkillCapability('skill_trash_empty')
    } catch (err) {
      logger.warn('清空回收站失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 永久删除回收站中的技能 */
  ipcMain.handle('skill:trash:delete', async (_event, args: { id: string }) => {
    try {
      return await invokeSkillCapability('skill_trash_delete', args)
    } catch (err) {
      logger.warn('永久删除技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 获取技能统计 */
  ipcMain.handle('skill:stats', async (_event, args?: { id?: string }) => {
    try {
      return await invokeSkillCapability('skill_stats', args ?? {})
    } catch (err) {
      logger.warn('获取技能统计失败', err as Error)
      return { success: true, data: [] }
    }
  })

  /** 导出单个技能 */
  ipcMain.handle('skill:export', async (_event, args: { id: string; outputPath?: string }) => {
    try {
      return await invokeSkillCapability('skill_export', args)
    } catch (err) {
      logger.warn('技能导出失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 导入单个技能 */
  ipcMain.handle('skill:import', async (_event, args: { archivePath: string }) => {
    try {
      return await invokeSkillCapability('skill_import', args)
    } catch (err) {
      logger.warn('技能导入失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 批量导出技能 */
  ipcMain.handle('skill:export:batch', async (_event, args: { ids: string[] }) => {
    try {
      return await invokeSkillCapability('skill_export_batch', args)
    } catch (err) {
      logger.warn('批量导出失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 批量导入技能 */
  ipcMain.handle('skill:import:batch', async (_event, args: { archivePath: string }) => {
    try {
      return await invokeSkillCapability('skill_import_batch', args)
    } catch (err) {
      logger.warn('批量导入失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  // ========== 技能安装 IPC ==========

  /** 搜索市场技能 */
  ipcMain.handle('skill:market:search', async (_event, args: { query: string }) => {
    if (!(await assertNetworkAllowed())) return []
    try {
      return await invokeSkillCapability('skill_market_search', args)
    } catch (err) {
      logger.warn('市场搜索失败', err as Error)
      return []
    }
  })

  /** 从市场安装技能 */
  ipcMain.handle('skill:market:install', async (_event, args: { skillId: string }) => {
    if (!(await assertNetworkAllowed())) return { success: false, error: '网络已断开' }
    try {
      return await invokeSkillCapability('skill_market_install', args)
    } catch (err) {
      logger.warn('市场安装失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 从 URL 安装技能 */
  ipcMain.handle('skill:install:url', async (_event, args: { url: string }) => {
    if (!(await assertNetworkAllowed())) return { success: false, error: '网络已断开' }
    try {
      return await invokeSkillCapability('skill_install_url', args)
    } catch (err) {
      logger.warn('URL 安装失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  /** 检查技能更新 */
  ipcMain.handle('skill:update:check', async () => {
    if (!(await assertNetworkAllowed())) return []
    try {
      return await invokeSkillCapability('skill_update_check')
    } catch (err) {
      logger.warn('检查更新失败', err as Error)
      return []
    }
  })

  /** 更新技能 */
  ipcMain.handle('skill:update:run', async (_event, args: { skillId: string }) => {
    if (!(await assertNetworkAllowed())) return { success: false, error: '网络已断开' }
    try {
      return await invokeSkillCapability('skill_update_run', args)
    } catch (err) {
      logger.warn('更新技能失败', err as Error)
      return { success: false, error: (err as Error).message }
    }
  })

  // ========== Git 与文件浏览 ==========

  /** 项目根目录（开发模式下向上两级） */
  const projectRoot = join(__dirname, '../../')

  /** 排除的目录/文件名 */
  const EXCLUDED_NAMES = new Set(['node_modules', '.git', 'dist', 'dist-packaged', '.DS_Store'])

  /**
   * 根据文件扩展名判断语言
   * @param filePath - 文件路径
   * @returns 语言标识
   */
  function detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      json: 'json', md: 'markdown', markdown: 'markdown',
      css: 'css', scss: 'scss', less: 'less', html: 'html', htm: 'html',
      py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
      c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
      sh: 'shell', bash: 'shell', zsh: 'shell',
      yaml: 'yaml', yml: 'yaml', toml: 'toml',
      xml: 'xml', svg: 'svg', sql: 'sql',
      txt: 'text', log: 'text', gitignore: 'text', env: 'text'
    }
    return map[ext] ?? 'text'
  }

  /**
   * 判断是否为 Markdown 文件
   * @param filePath - 文件路径
   */
  function isMarkdown(filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    return ext === 'md' || ext === 'markdown'
  }

  /**
   * 执行 git 命令
   * @param args - git 命令参数
   * @returns 命令输出
   */
  function runGit(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('git', args, { cwd: projectRoot, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message))
        } else {
          resolve(stdout)
        }
      })
    })
  }

  /**
   * 解析 git status --porcelain 输出
   * @param output - git status 输出
   * @returns 变更文件列表
   */
  function parseGitStatus(output: string): Array<{ path: string; status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'; staged: boolean }> {
    if (!output.trim()) return []
    return output.trim().split('\n').map((line) => {
      const indexStatus = line[0]
      const workTreeStatus = line[1]
      const filePath = line.slice(3).trim()

      let status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
      let staged = false

      if (indexStatus === '?' && workTreeStatus === '?') {
        status = 'untracked'
      } else if (indexStatus === 'A') {
        status = 'added'
        staged = true
      } else if (indexStatus === 'D' || workTreeStatus === 'D') {
        status = 'deleted'
        staged = indexStatus === 'D'
      } else if (indexStatus === 'R') {
        status = 'renamed'
        staged = true
      } else if (indexStatus === 'M' || workTreeStatus === 'M') {
        status = 'modified'
        staged = indexStatus === 'M'
      } else {
        status = 'modified'
      }

      return { path: filePath, status, staged }
    })
  }

  /** 获取 git 变更列表 */
  ipcMain.handle('git:status', async () => {
    try {
      const output = await runGit(['status', '--porcelain'])
      return parseGitStatus(output)
    } catch (err) {
      logger.warn('git status 执行失败', err as Error)
      return []
    }
  })

  /** 获取文件差异 */
  ipcMain.handle('git:diff', async (_event, args: { file: string }) => {
    try {
      return await runGit(['diff', args.file])
    } catch (err) {
      logger.warn('git diff 执行失败', err as Error)
      return ''
    }
  })

  /**
   * 递归读取目录，构建文件树
   * @param dirPath - 目录路径
   * @param depth - 当前递归深度
   * @param maxDepth - 最大递归深度
   * @returns 文件树节点数组
   */
  async function buildFileTree(dirPath: string, depth: number, maxDepth: number): Promise<Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }>> {
    if (depth >= maxDepth) return []

    const entries = await readdir(dirPath, { withFileTypes: true })
    const result: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }> = []

    // 排序：目录在前，文件在后，按名称排序
    const sorted = entries
      .filter((e) => !EXCLUDED_NAMES.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

    for (const entry of sorted) {
      const fullPath = join(dirPath, entry.name)
      const relativePath = fullPath.replace(projectRoot, '')

      if (entry.isDirectory()) {
        const children = await buildFileTree(fullPath, depth + 1, maxDepth)
        result.push({ name: entry.name, path: relativePath, type: 'directory', children })
      } else {
        result.push({ name: entry.name, path: relativePath, type: 'file' })
      }
    }

    return result
  }

  /** 列出项目文件树 */
  ipcMain.handle('files:list', async () => {
    try {
      return await buildFileTree(projectRoot, 0, 3)
    } catch (err) {
      logger.warn('文件树加载失败', err as Error)
      return []
    }
  })

  /** 读取文件内容 */
  ipcMain.handle('files:read', async (_event, args: { path: string }) => {
    try {
      const fullPath = join(projectRoot, args.path)
      const fileStat = await stat(fullPath)
      const MAX_SIZE = 100 * 1024 // 100KB

      if (fileStat.size > MAX_SIZE) {
        return {
          content: '',
          language: detectLanguage(args.path),
          isMarkdown: false,
          tooLarge: true
        }
      }

      const content = await readFile(fullPath, 'utf-8')
      return {
        content,
        language: detectLanguage(args.path),
        isMarkdown: isMarkdown(args.path),
        tooLarge: false
      }
    } catch (err) {
      logger.warn(`文件读取失败: ${args.path}`, err as Error)
      throw new Error(`无法读取文件: ${args.path}`)
    }
  })

  /** 读取任意路径文件（用于聊天附件） */
  ipcMain.handle('files:readAny', async (_event, args: { path: string }) => {
    try {
      const fileStat = await stat(args.path)
      const MAX_SIZE = 200 * 1024 // 200KB
      if (fileStat.size > MAX_SIZE) {
        return { success: false, error: `文件过大 (${(fileStat.size / 1024).toFixed(0)}KB)，最大支持 200KB` }
      }
      const content = await readFile(args.path, 'utf-8')
      const name = args.path.split(/[\\/]/).pop() ?? args.path
      return { success: true, name, content, size: fileStat.size }
    } catch (err) {
      return { success: false, error: `无法读取文件: ${(err as Error).message}` }
    }
  })

  /** 打开文件选择对话框 */
  ipcMain.handle('files:openPicker', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: '选择文件',
      properties: ['openFile'],
      filters: [
        { name: '文本文件', extensions: ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'css', 'html', 'xml', 'yaml', 'yml', 'toml', 'ini', 'sh', 'bat', 'log', 'csv', 'sql'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    const filePath = result.filePaths[0]
    try {
      const fileStat = await stat(filePath)
      const MAX_SIZE = 200 * 1024
      if (fileStat.size > MAX_SIZE) {
        return { canceled: false, error: `文件过大 (${(fileStat.size / 1024).toFixed(0)}KB)，最大支持 200KB` }
      }
      const content = await readFile(filePath, 'utf-8')
      const name = filePath.split(/[\\/]/).pop() ?? filePath
      return { canceled: false, name, content }
    } catch (err) {
      return { canceled: false, error: (err as Error).message }
    }
  })

  /** 通用文件/目录选择对话框 */
  ipcMain.handle('dialog:openFile', async (_event, options?: { filters?: Electron.FileFilter[]; properties?: string[] }) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: options?.properties?.includes('openDirectory') ? '选择目录' : '选择文件',
      properties: (options?.properties as Electron.OpenDialogOptions['properties']) ?? ['openFile'],
      filters: options?.filters
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    return { canceled: false, filePaths: result.filePaths }
  })

  // ========== Live2D 桌面宠物窗口 ==========

  /** Live2D 宠物窗口引用 */
  let live2dWindow: BrowserWindow | null = null

  /**
   * 创建 Live2D 透明窗口
   * 透明、无边框、可穿透点击、置顶
   */
  ipcMain.handle('live2d:create-window', async () => {
    if (live2dWindow && !live2dWindow.isDestroyed()) {
      live2dWindow.focus()
      return true
    }

    live2dWindow = new BrowserWindow({
      width: 300,
      height: 400,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    })

    // 初始关闭鼠标穿透，等模型加载完成后由渲染进程动态控制
    live2dWindow.setIgnoreMouseEvents(false)

    // 开发模式加载 dev server，生产模式加载文件
    if (process.env.VITE_DEV_SERVER_URL) {
      live2dWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/live2d-pet`)
    } else {
      live2dWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '#/live2d-pet',
      })
    }

    // 注意：不在这里开启鼠标穿透，由渲染进程根据鼠标是否在模型上来动态控制
    // 解决鼠标穿透导致无法点击宠物的问题

    // 页面加载失败时记录日志
    live2dWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      logger.error(`[Live2D] 页面加载失败: ${errorCode} - ${errorDescription}`)
    })

    live2dWindow.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) { // warn 或 error
        logger.warn(`[Live2D] ${message}`)
      }
    })

    live2dWindow.on('closed', () => {
      live2dWindow = null
    })

    return true
  })

  /** 关闭 Live2D 宠物窗口 */
  ipcMain.handle('live2d:close-window', async () => {
    if (live2dWindow && !live2dWindow.isDestroyed()) {
      live2dWindow.close()
      live2dWindow = null
    }
    return true
  })

  /** 切换 Live2D 窗口可见性 */
  ipcMain.handle('live2d:toggle-visibility', async () => {
    if (!live2dWindow || live2dWindow.isDestroyed()) {
      return false
    }

    if (live2dWindow.isVisible()) {
      live2dWindow.hide()
      return false
    }
    live2dWindow.show()
    return true
  })

  /** 开启/关闭鼠标穿透（拖拽模式切换） */
  ipcMain.handle('live2d:set-ignore-mouse', async (_event, _ignore: boolean) => {
    // 不再使用鼠标穿透，窗口始终接收鼠标事件，确保拖拽可靠
    return true
  })

  /** 开始窗口拖拽（无边框窗口拖拽移动） */
  ipcMain.handle('live2d:start-drag', async () => {
    if (!live2dWindow || live2dWindow.isDestroyed()) return
    // 使用 Electron 内置的窗口拖拽 API
    live2dWindow.webContents.sendInputEvent({
      type: 'mouseDown',
      x: 0,
      y: 0,
      button: 'left',
      clickCount: 1,
    })
  })

  /** 获取窗口位置和大小 */
  ipcMain.handle('live2d:get-bounds', async () => {
    if (!live2dWindow || live2dWindow.isDestroyed()) return null
    return live2dWindow.getBounds()
  })

  /** 设置窗口大小 */
  ipcMain.handle('live2d:set-size', async (_event, args: { width: number; height: number }) => {
    if (!live2dWindow || live2dWindow.isDestroyed()) return
    const [x, y] = live2dWindow.getPosition()
    live2dWindow.setBounds({ x, y, width: Math.max(150, args.width), height: Math.max(200, args.height) })
    return true
  })

  /** 设置窗口位置 */
  ipcMain.handle('live2d:set-position', async (_event, args: { x: number; y: number }) => {
    if (!live2dWindow || live2dWindow.isDestroyed()) return
    live2dWindow.setPosition(args.x, args.y)
    return true
  })

  // ========== 全局快捷键 IPC ==========

  /** 已注册的快捷键映射 accelerator → callback */
  const registeredHotkeys = new Map<string, () => void>()

  /** 注册全局快捷键（兜底：当 desktop-integration 模块未加载时使用） */
  ipcMain.handle('hotkey_register', async (_event, args: { accelerator: string; description?: string }) => {
    registeredModuleIpc.add('hotkey_register')
    try {
      const { accelerator } = args
      // 如果已注册，先注销
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

  /** 注销全局快捷键 */
  ipcMain.handle('hotkey_unregister', async (_event, args: { accelerator: string }) => {
    registeredModuleIpc.add('hotkey_unregister')
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

  /** 列出已注册的快捷键 */
  ipcMain.handle('hotkey_list', async () => {
    registeredModuleIpc.add('hotkey_list')
    return Array.from(registeredHotkeys.keys())
  })

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

  // ========== SOUL 人格系统 ==========

  /** 获取 SoulManager 单例 */
  const soulManagerInstance = SoulManager.getInstance()
  function getSoulManager() {
    return soulManagerInstance
  }

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
