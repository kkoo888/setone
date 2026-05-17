import type { UtilityProcess } from 'electron'
import type { Logger } from '../types/logger'

/** 沙箱 IPC 消息格式 */
export interface SandboxIPCMessage {
  channel: string
  data?: unknown
  requestId?: string
}

/** 待处理的请求 */
export interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** 默认请求超时（毫秒） */
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

/**
 * 沙箱 IPC 桥接层
 *
 * 提供可靠的 request/response 通信模式，支持超时和并发请求。
 * 通过 requestId 关联请求与响应，确保消息不丢失。
 */
export class SandboxIPC {
  private pendingRequests = new Map<string, PendingRequest>()
  private requestCounter = 0
  private logger: Logger
  private process: UtilityProcess
  private moduleId: string

  constructor(
    process: UtilityProcess,
    moduleId: string,
    logger: Logger
  ) {
    this.process = process
    this.moduleId = moduleId
    this.logger = logger

    this.process.on('message', (message: unknown) => {
      const msg = message as SandboxIPCMessage
      if (!msg.requestId || !this.pendingRequests.has(msg.requestId)) {
        return
      }

      const pending = this.pendingRequests.get(msg.requestId)!
      this.pendingRequests.delete(msg.requestId)
      clearTimeout(pending.timer)

      if (msg.channel === '__response_error__') {
        pending.reject(new Error(String(msg.data)))
      } else {
        pending.resolve(msg.data)
      }
    })
  }

  /**
   * 发送消息（单向，不等待响应）
   * @param channel - 消息通道
   * @param data - 消息数据
   */
  send(channel: string, data?: unknown): void {
    this.process.postMessage({ channel, data })
  }

  /**
   * 请求-响应模式（带超时）
   * @param channel - 消息通道
   * @param data - 请求数据
   * @param timeoutMs - 超时时间（毫秒）
   * @returns 响应数据
   */
  async request<T = unknown>(
    channel: string,
    data?: unknown,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<T> {
    const requestId = `${this.moduleId}-${++this.requestCounter}`

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(
          new Error(
            `沙箱 "${this.moduleId}" 请求 "${channel}" 超时 (${timeoutMs}ms)`
          )
        )
      }, timeoutMs)

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })

      this.process.postMessage({ channel, data, requestId })
    })
  }

  /**
   * 清理所有待处理请求
   */
  dispose(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('沙箱 IPC 已关闭'))
    }
    this.pendingRequests.clear()
  }
}
