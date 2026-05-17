import { describe, it, expect, vi } from 'vitest'
import { GlobalEventBus } from '../../src/main/core/event-bus'
import { ModuleScopedEventBus } from '../../src/main/core/scoped-event-bus'

describe('GlobalEventBus', () => {
  it('on/emit 基本通信', () => {
    const bus = new GlobalEventBus()
    const handler = vi.fn()
    bus.on('test', handler)
    bus.emit('test', { value: 42 })
    expect(handler).toHaveBeenCalledWith({ value: 42 })
  })

  it('off 取消监听', () => {
    const bus = new GlobalEventBus()
    const handler = vi.fn()
    bus.on('test', handler)
    bus.off('test', handler)
    bus.emit('test', { value: 42 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('once 只触发一次', () => {
    const bus = new GlobalEventBus()
    const handler = vi.fn()
    bus.once('test', handler)
    bus.emit('test', 'first')
    bus.emit('test', 'second')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('first')
  })

  it('removeAllListeners(event) 只清除指定事件', () => {
    const bus = new GlobalEventBus()
    const handlerA = vi.fn()
    const handlerB = vi.fn()

    bus.on('eventA', handlerA)
    bus.on('eventB', handlerB)

    bus.removeAllListeners('eventA')
    bus.emit('eventA', 'data')
    bus.emit('eventB', 'data')

    expect(handlerA).not.toHaveBeenCalled()
    expect(handlerB).toHaveBeenCalled()
  })

  it('removeAllListeners() 无参数清除所有事件', () => {
    const bus = new GlobalEventBus()
    const handlerA = vi.fn()
    const handlerB = vi.fn()

    bus.on('eventA', handlerA)
    bus.on('eventB', handlerB)

    bus.removeAllListeners()
    bus.emit('eventA', 'data')
    bus.emit('eventB', 'data')

    expect(handlerA).not.toHaveBeenCalled()
    expect(handlerB).not.toHaveBeenCalled()
  })

  it('listenerCount 返回正确的监听器数量', () => {
    const bus = new GlobalEventBus()
    expect(bus.listenerCount('test')).toBe(0)

    const handler1 = vi.fn()
    const handler2 = vi.fn()
    bus.on('test', handler1)
    bus.on('test', handler2)

    expect(bus.listenerCount('test')).toBe(2)
  })

  it('异步处理器异常不影响其他处理器', async () => {
    const bus = new GlobalEventBus()
    const goodHandler = vi.fn()
    const badHandler = vi.fn().mockRejectedValue(new Error('boom'))

    bus.on('test', badHandler)
    bus.on('test', goodHandler)
    bus.emit('test', 'data')

    // 等待异步处理器执行
    await new Promise(r => setTimeout(r, 10))
    expect(goodHandler).toHaveBeenCalled()
  })
})

describe('ModuleScopedEventBus', () => {
  it('只允许订阅声明的事件', () => {
    const globalBus = new GlobalEventBus()
    const scoped = new ModuleScopedEventBus(
      globalBus,
      'test-module',
      new Set(['on_result']),
      new Set(['on_input'])
    )

    const handler = vi.fn()

    // 允许的事件
    scoped.on('on_input', handler)
    globalBus.emit('on_input', 'data')
    expect(handler).toHaveBeenCalled()

    // 未声明的事件应该被拦截
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    scoped.on('on_secret', handler)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('只允许发布声明的事件', () => {
    const globalBus = new GlobalEventBus()
    const scoped = new ModuleScopedEventBus(
      globalBus,
      'test-module',
      new Set(['on_result']),
      new Set(['on_input'])
    )

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // 未声明的发布应该被拦截
    scoped.emit('on_secret', 'data')
    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })
})
