/**
 * 契约测试 — 事件总线接口
 * @description 验证事件总线实现是否符合 EventBus 接口规范
 */
import { describe, it, expect, vi } from 'vitest'
import { GlobalEventBus } from '../../src/main/core/event-bus'
import type { EventBus } from '../../src/main/types/event'

/**
 * 契约验证：EventBus 必须实现的方法
 */
function validateEventBusContract(bus: EventBus): void {
  expect(typeof bus.on).toBe('function')
  expect(typeof bus.off).toBe('function')
  expect(typeof bus.emit).toBe('function')
  expect(typeof bus.once).toBe('function')
  expect(typeof bus.removeAllListeners).toBe('function')
}

describe('事件总线接口契约测试', () => {
  it('GlobalEventBus 实现 EventBus 接口', () => {
    const bus = new GlobalEventBus()
    validateEventBusContract(bus)
  })

  it('on/off 对称性', () => {
    const bus = new GlobalEventBus()
    const handler = vi.fn()

    bus.on('test', handler)
    bus.emit('test', 'data')
    expect(handler).toHaveBeenCalledTimes(1)

    bus.off('test', handler)
    bus.emit('test', 'data')
    expect(handler).toHaveBeenCalledTimes(1) // 不再被调用
  })

  it('once 只触发一次', () => {
    const bus = new GlobalEventBus()
    const handler = vi.fn()

    bus.once('test', handler)
    bus.emit('test', 'first')
    bus.emit('test', 'second')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('removeAllListeners(event) 清除指定事件', () => {
    const bus = new GlobalEventBus()
    const h1 = vi.fn()
    const h2 = vi.fn()

    bus.on('a', h1)
    bus.on('b', h2)
    bus.removeAllListeners('a')

    bus.emit('a', 'data')
    bus.emit('b', 'data')
    expect(h1).not.toHaveBeenCalled()
    expect(h2).toHaveBeenCalled()
  })

  it('removeAllListeners() 清除所有事件', () => {
    const bus = new GlobalEventBus()
    const h1 = vi.fn()
    const h2 = vi.fn()

    bus.on('a', h1)
    bus.on('b', h2)
    bus.removeAllListeners()

    bus.emit('a', 'data')
    bus.emit('b', 'data')
    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })

  it('emit 空事件名不崩溃', () => {
    const bus = new GlobalEventBus()
    // 不应抛出异常
    expect(() => bus.emit('', 'data')).not.toThrow()
  })

  it('listenerCount 返回正确数量', () => {
    const bus = new GlobalEventBus()
    expect(bus.listenerCount('test')).toBe(0)

    bus.on('test', vi.fn())
    bus.on('test', vi.fn())
    expect(bus.listenerCount('test')).toBe(2)
  })
})

export { validateEventBusContract }
