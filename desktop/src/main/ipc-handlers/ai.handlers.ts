/**
 * AI 对话与工具执行 IPC 处理器
 * ai:chat / ai:chatStream + collectModuleTools / executeToolCall
 */
import { ipcMain, BrowserWindow } from 'electron'
import type { ToolDefinition, ToolCall } from '../types/ai'
import { getToolParamSchema } from '../core/tool-param-schemas'
import { registeredModuleIpc } from './module.handlers'
import type { HandlerDeps } from './types'

/**
 * 从所有活跃模块中收集工具定义
 * 将模块的 tool 类型能力转换为 Ollama ToolDefinition 格式
 * @param deps - 共享依赖
 * @returns 工具定义数组
 */
function collectModuleTools(deps: HandlerDeps): ToolDefinition[] {
  const { moduleManager, logger } = deps
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
    } catch (err) {
      logger.warn(`收集模块 ${reg.meta.id} 的工具定义失败，跳过`, err as Error)
    }
  }
  return tools
}

/**
 * 执行工具调用
 * 根据 tool_call 的 function name 找到对应模块能力并执行
 * @param toolCall - 工具调用请求
 * @param deps - 共享依赖
 * @returns 执行结果
 */
async function executeToolCall(toolCall: ToolCall, deps: HandlerDeps): Promise<{ id: string; name: string; result: unknown; error?: string; status: 'success' | 'error'; durationMs: number }> {
  const { moduleManager } = deps
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

/**
 * 注册 AI 对话相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerAiHandlers(deps: HandlerDeps): void {
  const { logger, aiService } = deps

  registeredModuleIpc.add('ai:chat')
  registeredModuleIpc.add('ai:chatStream')

  /** AI 非流式对话（支持工具调用） */
  ipcMain.handle('ai:chat', async (_event, args: { messages: Array<{ role: string; content: string; images?: string[] }> }) => {
    if (!aiService) throw new Error('AI 服务未初始化')

    const messages = args.messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      ...(m.images ? { images: m.images } : {})
    }))

    const tools = collectModuleTools(deps)
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
          const toolResult = await executeToolCall(toolCall, deps)
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

    const tools = collectModuleTools(deps)
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

          const toolResult = await executeToolCall(toolCall, deps)

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
}
