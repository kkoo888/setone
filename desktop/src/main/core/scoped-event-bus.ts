import type { ScopedEventBus, EventBus, EventHandler } from '../types/event'

export class ModuleScopedEventBus implements ScopedEventBus {
  constructor(
    private globalBus: EventBus,
    private moduleId: string,
    private allowedEmitEvents: Set<string>,
    private allowedListenEvents: Set<string>
  ) {}

  on<T = unknown>(event: string, handler: EventHandler<T>): void {
    if (!this.allowedListenEvents.has(event)) {
      console.warn(
        `[ScopedEventBus] 模块 "${this.moduleId}" 未声明消费事件 "${event}"，已拦截`
      )
      return
    }
    this.globalBus.on(event, handler)
  }

  off(event: string, handler: EventHandler): void {
    if (!this.allowedListenEvents.has(event)) {
      console.warn(
        `[ScopedEventBus] 模块 "${this.moduleId}" 未声明消费事件 "${event}"，off() 已拦截`
      )
      return
    }
    this.globalBus.off(event, handler)
  }

  emit<T = unknown>(event: string, data?: T): void {
    if (!this.allowedEmitEvents.has(event)) {
      console.warn(
        `[ScopedEventBus] 模块 "${this.moduleId}" 未声明发布事件 "${event}"，已拦截`
      )
      return
    }
    this.globalBus.emit(event, data)
  }
}

/**
 * 创建模块的限定范围事件总线
 */
export function createScopedEventBus(
  globalBus: EventBus,
  moduleId: string,
  provides: Array<{ type: string; name: string }>,
  consumes: Array<{ type: string; name: string }>
): ScopedEventBus {
  const allowedEmit = new Set(
    provides.filter(p => p.type === 'event').map(p => p.name)
  )
  const allowedListen = new Set(
    consumes.filter(c => c.type === 'event').map(c => c.name)
  )

  return new ModuleScopedEventBus(globalBus, moduleId, allowedEmit, allowedListen)
}
