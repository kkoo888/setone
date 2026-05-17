import type { ChatMessage } from '../stores/useChatStore'

export interface StreamCallbacks {
  onChunk: (chunk: string) => void
  onToolCall: (
    name: string,
    result: unknown,
    meta?: {
      arguments?: Record<string, unknown>
      error?: string
      status?: 'running' | 'success' | 'error'
      durationMs?: number
    }
  ) => void
  onDone: (fullText: string) => void
  onError: (error: string) => void
}

export class ChatService {
  private static activeStream: { requestId: string; cleanup: () => void } | null = null

  /** 非流式发送消息 */
  static async sendMessage(
    content: string,
    history: ChatMessage[]
  ): Promise<{ response: string; toolCalls?: Array<{ id: string; name: string; arguments?: Record<string, unknown>; result?: unknown; error?: string; status?: 'running' | 'success' | 'error'; durationMs?: number }> }> {
    const messages = history.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.images && m.images.length > 0 ? { images: m.images } : {})
    }))
    messages.push({ role: 'user' as const, content })
    const result = await window.electronAPI.invoke('ai:chat', { messages })
    return result as { response: string; toolCalls?: Array<{ id: string; name: string; arguments?: Record<string, unknown>; result?: unknown; error?: string; status?: 'running' | 'success' | 'error'; durationMs?: number }> }
  }

  /** 流式发送消息（基于 requestId 事件监听） */
  static async sendMessageStream(
    content: string,
    history: ChatMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    this.activeStream?.cleanup()
    const messages = history.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.images && m.images.length > 0 ? { images: m.images } : {})
    }))
    messages.push({ role: 'user' as const, content })

    const requestId = crypto.randomUUID()
    let fullText = ''
    let errorHandled = false

    const offChunk = window.electronAPI.on(`ai:chatStream:chunk:${requestId}`, (...args: unknown[]) => {
      const chunk = args[0] as { content?: string; toolCall?: { name: string; arguments?: Record<string, unknown>; result?: unknown; error?: string; status?: 'running' | 'success' | 'error'; durationMs?: number } } | undefined
      if (!chunk) return
      if (chunk.content) { fullText += chunk.content; callbacks.onChunk(chunk.content) }
      if (chunk.toolCall) { callbacks.onToolCall(chunk.toolCall.name, chunk.toolCall.result, { arguments: chunk.toolCall.arguments, error: chunk.toolCall.error, status: chunk.toolCall.status, durationMs: chunk.toolCall.durationMs }) }
    })

    const offDone = window.electronAPI.on(`ai:chatStream:done:${requestId}`, () => { cleanup(); callbacks.onDone(fullText) })
    const offError = window.electronAPI.on(`ai:chatStream:error:${requestId}`, (...args: unknown[]) => {
      if (errorHandled) return
      errorHandled = true
      cleanup()
      const data = args[0] as { error?: string } | undefined
      callbacks.onError(data?.error ?? '未知错误')
    })

    const cleanup = () => { offChunk(); offDone(); offError(); this.activeStream = null }
    this.activeStream = { requestId, cleanup }

    try {
      await window.electronAPI.invoke('ai:chatStream', { requestId, messages })
    } catch (err) {
      if (!errorHandled) { errorHandled = true; cleanup(); callbacks.onError(err instanceof Error ? err.message : String(err)) }
    }
  }

  /** 取消当前流 */
  static cancelStream(): void { this.activeStream?.cleanup(); this.activeStream = null }
}
