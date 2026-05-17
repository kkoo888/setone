/**
 * 集成测试 — 事件总线通信
 * @description 测试 GlobalEventBus + ModuleScopedEventBus 的端到端通信
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GlobalEventBus } from '../../../src/main/core/event-bus'
import { ModuleScopedEventBus } from '../../../src/main/core/scoped-event-bus'

describe('事件总线通信集成测试', () => {
  let globalBus: GlobalEventBus

  beforeEach(() => {
    globalBus = new GlobalEventBus()
  })

  describe('模块间通信', () => {
    it('模块 A 发送事件 → 模块 B 接收', () => {
      const moduleA = new ModuleScopedEventBus(
        globalBus, 'moduleA',
        new Set(['on_result']),  // 可发布
        new Set(['on_input']),   // 可订阅
      )
      const moduleB = new ModuleScopedEventBus(
        globalBus, 'moduleB',
        new Set(['on_input']),
        new Set(['on_result']),
      )

      const handlerB = vi.fn()
      moduleB.on('on_result', handlerB)

      moduleA.emit('on_result', { data: 'from A' })
      expect(handlerB).toHaveBeenCalledWith({ data: 'from A' })
    })

    it('多个模块订阅同一事件', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      globalBus.on('shared:event', handler1)
      globalBus.on('shared:event', handler2)

      globalBus.emit('shared:event', { msg: 'broadcast' })

      expect(handler1).toHaveBeenCalledWith({ msg: 'broadcast' })
      expect(handler2).toHaveBeenCalledWith({ msg: 'broadcast' })
    })

    it('模块卸载后不再接收事件', () => {
      const scoped = new ModuleScopedEventBus(
        globalBus, 'temp-module',
        new Set(['on_result']),
        new Set(['on_input']),
      )

      const handler = vi.fn()
      scoped.on('on_input', handler)

      // 模拟卸载：移除所有监听
      globalBus.removeAllListeners('on_input')

      globalBus.emit('on_input', 'data')
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('错误隔离', () => {
    it('一个处理器异常不影响其他处理器', async () => {
      const goodHandler = vi.fn()
      const badHandler = vi.fn().mockRejectedValue(new Error('boom'))

      globalBus.on('test', badHandler)
      globalBus.on('test', goodHandler)

      globalBus.emit('test', 'data')

      await new Promise(r => setTimeout(r, 10))
      expect(goodHandler).toHaveBeenCalled()
    })

    it('onError 捕获处理器异常', async () => {
      const errorHandler = vi.fn()
      globalBus.onError(errorHandler)

      globalBus.on('test', () => { throw new Error('handler error') })
      globalBus.emit('test', 'data')

      await new Promise(r => setTimeout(r, 10))
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'test',
          error: expect.any(Error),
        })
      )
    })
  })

  describe('事件类型安全', () => {
    it('typed on/emit 编译时类型检查', () => {
      // 这些在 TypeScript 编译时检查，运行时只验证行为
      const handler = vi.fn()
      globalBus.on('on_module_loaded', handler)
      globalBus.emit('on_module_loaded', { moduleId: 'test' })
      expect(handler).toHaveBeenCalledWith({ moduleId: 'test' })
    })
  })

  describe('内存管理', () => {
    it('removeAllListeners 正确清理 handlerMap', () => {
      const handler = vi.fn()
      globalBus.on('test', handler)
      globalBus.on('test2', handler)

      globalBus.removeAllListeners()
      globalBus.emit('test', 'data')
      globalBus.emit('test2', 'data')

      expect(handler).not.toHaveBeenCalled()
      expect(globalBus.listenerCount('test')).toBe(0)
      expect(globalBus.listenerCount('test2')).toBe(0)
    })

    it('大量注册/注销不泄漏', () => {
      const handlers: Array<() => void> = []
      for (let i = 0; i < 1000; i++) {
        const h = vi.fn()
        handlers.push(h)
        globalBus.on('leak-test', h)
      }

      expect(globalBus.listenerCount('leak-test')).toBe(1000)

      globalBus.removeAllListeners('leak-test')
      expect(globalBus.listenerCount('leak-test')).toBe(0)
    })
  })
})
