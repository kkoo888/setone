import { EventEmitter } from 'events'
import type { EventBus, EventHandler, EventMap } from '../types/event'

export class GlobalEventBus implements EventBus {
  private emitter = new EventEmitter()
  /**
   * 处理器映射表
   * 结构：原始handler → (事件名 → wrappedHandler集合)
   *
   * 为什么需要三层：
   * - on() 会将用户的 handler 包装成 wrappedHandler（添加 try-catch 错误处理）
   * - off() 需要通过原始 handler 找到对应的 wrappedHandler 进行精确取消
   * - 同一个 handler 可能被注册到多个事件，所以用 Set 存储
   * - removeAllListeners(event) 需要按事件名批量清理
   */
  private handlerMap = new Map<EventHandler, Map<string, Set<EventHandler>>>()

  constructor(maxListeners: number = 100) {
    // 提高最大监听器数量，避免模块多时报警告
    this.emitter.setMaxListeners(maxListeners)
  }

  /** 注册事件监听器（类型安全版本） */
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void
  /** 注册事件监听器（字符串事件名，兼容模式） */
  on<T = unknown>(event: string, handler: EventHandler<T>): void
  on<T = unknown>(event: string, handler: EventHandler<T>): void {
    const wrappedHandler = async (data: unknown) => {
      try {
        await handler(data as T)
      } catch (err) {
        console.error(`[EventBus] 事件处理异常: ${event}`, err)
        this.emitter.emit('_error', { event, error: err })
      }
    }

    // 保存映射关系，支持精确取消
    if (!this.handlerMap.has(handler as EventHandler)) {
      this.handlerMap.set(handler as EventHandler, new Map())
    }
    const eventMap = this.handlerMap.get(handler as EventHandler)!
    if (!eventMap.has(event)) {
      eventMap.set(event, new Set())
    }
    eventMap.get(event)!.add(wrappedHandler as EventHandler)

    this.emitter.on(event, wrappedHandler)
  }

  off(event: string, handler: EventHandler): void {
    const eventMap = this.handlerMap.get(handler)
    if (eventMap) {
      const handlers = eventMap.get(event)
      if (handlers) {
        for (const wrapped of handlers) {
          this.emitter.off(event, wrapped)
        }
        handlers.clear()
      }
    }
  }

  emit<T = unknown>(event: string, data?: T): void {
    if (!event || typeof event !== 'string') {
      console.warn('[EventBus] emit: 事件名不能为空字符串')
      return
    }
    this.emitter.emit(event, data)
  }

  once<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.emitter.once(event, async (data: unknown) => {
      try {
        await handler(data as T)
      } catch (err) {
        console.error(`[EventBus] once 事件处理异常: ${event}`, err)
        this.emitter.emit('_error', { event, error: err })
      }
    })
  }

  removeAllListeners(event?: string): void {
    if (event) {
      // 只移除指定事件的监听器，不清空整个 handlerMap
      this.emitter.removeAllListeners(event)
      // 清理 handlerMap 中对应事件的映射，并移除已空的条目防止内存泄漏
      for (const [handler, eventMap] of this.handlerMap) {
        eventMap.delete(event)
        if (eventMap.size === 0) {
          this.handlerMap.delete(handler)
        }
      }
    } else {
      // 移除所有事件的监听器
      this.emitter.removeAllListeners()
      this.handlerMap.clear()
    }
  }

  /** 获取事件监听器数量（调试用） */
  listenerCount(event: string): number {
    return this.emitter.listenerCount(event)
  }

  /**
   * 监听内部错误事件
   * 当任何事件处理器抛出异常时，错误会通过 _error 事件上报
   * @param handler 错误处理器，接收出错的事件名和错误对象
   * @returns 取消监听的函数
   */
  onError(handler: (data: { event: string; error: unknown }) => void): () => void {
    this.emitter.on('_error', handler)
    return () => {
      this.emitter.off('_error', handler)
    }
  }
}
