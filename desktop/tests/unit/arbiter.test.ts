import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CapabilityRegistry } from '../../src/main/core/capability-registry'
import { CapabilityArbiter } from '../../src/main/core/capability-arbiter'
import type { Capability, ArbitrationRequest } from '../../src/main/types/capability'
import type { Logger } from '../../src/main/types/logger'
import type { ConfigManager } from '../../src/main/types/config'

// ── 辅助工厂 ──────────────────────────────────────────

const createMockLogger = (): Logger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setLevel: vi.fn()
})

const createMockConfig = (overrides?: Record<string, string>): ConfigManager => {
  const store = new Map<string, unknown>()
  if (overrides) store.set('capabilityOverrides', overrides)
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(store.get(key))),
    set: vi.fn().mockImplementation((key: string, val: unknown) => {
      store.set(key, val)
      return Promise.resolve()
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    onChange: vi.fn(),
    getModuleConfig: vi.fn().mockResolvedValue(undefined),
    setModuleConfig: vi.fn().mockResolvedValue(undefined),
    deleteModuleConfig: vi.fn().mockResolvedValue(undefined)
  }
}

const createCapability = (overrides: Partial<Capability> = {}): Capability => ({
  name: 'test-capability',
  type: 'tool',
  description: '测试能力',
  moduleId: 'test-module',
  priority: 100,
  handler: { execute: vi.fn() },
  ...overrides
})

// ── CapabilityRegistry 测试 ────────────────────────────

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry
  let logger: Logger

  beforeEach(() => {
    logger = createMockLogger()
    registry = new CapabilityRegistry(logger)
  })

  it('注册和获取能力', () => {
    const cap = createCapability({ moduleId: 'mod-a' })
    registry.register(cap)

    const caps = registry.getCapabilities('test-capability')
    expect(caps).toHaveLength(1)
    expect(caps[0].moduleId).toBe('mod-a')
  })

  it('获取不存在的能力返回空数组', () => {
    expect(registry.getCapabilities('nonexistent')).toEqual([])
  })

  it('同名能力多模块注册', () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 10 }))
    registry.register(createCapability({ moduleId: 'mod-b', priority: 20 }))

    const caps = registry.getCapabilities('test-capability')
    expect(caps).toHaveLength(2)
  })

  it('去重：同模块重复注册更新而非追加', () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 10 }))
    registry.register(createCapability({ moduleId: 'mod-a', priority: 99 }))

    const caps = registry.getCapabilities('test-capability')
    expect(caps).toHaveLength(1)
    expect(caps[0].priority).toBe(99)
  })

  it('getAllNames 返回所有已注册能力名称', () => {
    registry.register(createCapability({ name: 'cap-a', moduleId: 'mod-a' }))
    registry.register(createCapability({ name: 'cap-b', moduleId: 'mod-a' }))
    registry.register(createCapability({ name: 'cap-a', moduleId: 'mod-b' }))

    const names = registry.getAllNames()
    expect(names).toHaveLength(2)
    expect(names).toContain('cap-a')
    expect(names).toContain('cap-b')
  })

  it('getByModule 按模块分组', () => {
    registry.register(createCapability({ name: 'cap-a', moduleId: 'mod-a' }))
    registry.register(createCapability({ name: 'cap-b', moduleId: 'mod-a' }))
    registry.register(createCapability({ name: 'cap-a', moduleId: 'mod-b' }))

    const byModule = registry.getByModule()
    expect(byModule.get('mod-a')).toHaveLength(2)
    expect(byModule.get('mod-b')).toHaveLength(1)
  })

  it('注销模块所有能力', () => {
    registry.register(createCapability({ moduleId: 'mod-a' }))
    registry.register(createCapability({ moduleId: 'mod-b' }))

    registry.unregisterModule('mod-a')
    const caps = registry.getCapabilities('test-capability')
    expect(caps).toHaveLength(1)
    expect(caps[0].moduleId).toBe('mod-b')
  })

  it('注销模块后若无剩余能力则清除该条目', () => {
    registry.register(createCapability({ moduleId: 'mod-a' }))

    registry.unregisterModule('mod-a')
    expect(registry.getCapabilities('test-capability')).toEqual([])
    expect(registry.getAllNames()).not.toContain('test-capability')
  })

  it('注销不存在的模块不报错', () => {
    registry.register(createCapability({ moduleId: 'mod-a' }))

    expect(() => registry.unregisterModule('ghost-module')).not.toThrow()
    expect(registry.getCapabilities('test-capability')).toHaveLength(1)
  })
})

// ── CapabilityArbiter 测试 ─────────────────────────────

describe('CapabilityArbiter', () => {
  let registry: CapabilityRegistry
  let arbiter: CapabilityArbiter
  let logger: Logger
  let config: ConfigManager

  beforeEach(() => {
    logger = createMockLogger()
    config = createMockConfig()
    registry = new CapabilityRegistry(logger)
    arbiter = new CapabilityArbiter(registry, config, logger)
  })

  // ── arbitrate 基本行为 ──

  it('无能力时返回 null 并记录警告', async () => {
    const result = await arbiter.arbitrate({
      capabilityName: 'nonexistent',
      params: {}
    })
    expect(result).toBeNull()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('单一模块直接选中', async () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 10 }))

    const result = await arbiter.arbitrate({
      capabilityName: 'test-capability',
      params: {}
    })
    expect(result).not.toBeNull()
    expect(result!.selectedModuleId).toBe('mod-a')
    expect(result!.reason).toBe('priority')
  })

  // ── 优先级排序 ──

  it('多模块按 priority 排序（数值越小越优先）', async () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 20 }))
    registry.register(createCapability({ moduleId: 'mod-b', priority: 10 }))

    const result = await arbiter.arbitrate({
      capabilityName: 'test-capability',
      params: {}
    })
    expect(result!.selectedModuleId).toBe('mod-b')
    expect(result!.reason).toBe('priority')
  })

  it('三个及以上模块时选中 priority 最小者', async () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 50 }))
    registry.register(createCapability({ moduleId: 'mod-b', priority: 5 }))
    registry.register(createCapability({ moduleId: 'mod-c', priority: 30 }))

    const result = await arbiter.arbitrate({
      capabilityName: 'test-capability',
      params: {}
    })
    expect(result!.selectedModuleId).toBe('mod-b')
  })

  it('同优先级按启用顺序降级', async () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 10 }))
    registry.register(createCapability({ moduleId: 'mod-b', priority: 10 }))

    arbiter.setModuleLoadOrder('mod-a', 1)
    arbiter.setModuleLoadOrder('mod-b', 2)

    const result = await arbiter.arbitrate({
      capabilityName: 'test-capability',
      params: {}
    })
    expect(result!.selectedModuleId).toBe('mod-a')
    expect(result!.reason).toBe('load_order')
  })

  it('同优先级未设置加载顺序时仍能选出结果', async () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 10 }))
    registry.register(createCapability({ moduleId: 'mod-b', priority: 10 }))

    const result = await arbiter.arbitrate({
      capabilityName: 'test-capability',
      params: {}
    })
    expect(result).not.toBeNull()
    expect(['mod-a', 'mod-b']).toContain(result!.selectedModuleId)
    expect(result!.reason).toBe('load_order')
  })

  // ── 用户显式指定 ──

  it('用户显式指定优先于 priority', async () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 1 }))
    registry.register(createCapability({ moduleId: 'mod-b', priority: 100 }))

    const result = await arbiter.arbitrate({
      capabilityName: 'test-capability',
      params: {},
      requesterModuleId: 'mod-b'
    })
    expect(result!.selectedModuleId).toBe('mod-b')
    expect(result!.reason).toBe('user_selection')
  })

  it('用户显式指定未注册模块时回退到 priority', async () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 10 }))

    const result = await arbiter.arbitrate({
      capabilityName: 'test-capability',
      params: {},
      requesterModuleId: 'ghost-module'
    })
    expect(result!.selectedModuleId).toBe('mod-a')
    expect(result!.reason).toBe('priority')
  })

  // ── setUserOverride / getUserOverride / clearUserOverride ──

  it('用户覆盖设置优先于 priority', async () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 1 }))
    registry.register(createCapability({ moduleId: 'mod-b', priority: 100 }))

    await arbiter.setUserOverride('test-capability', 'mod-b')

    const result = await arbiter.arbitrate({
      capabilityName: 'test-capability',
      params: {}
    })
    expect(result!.selectedModuleId).toBe('mod-b')
    expect(result!.reason).toBe('user_override')
  })

  it('setUserOverride 持久化到配置存储', async () => {
    registry.register(createCapability({ moduleId: 'mod-a' }))

    await arbiter.setUserOverride('test-capability', 'mod-a')

    expect(config.set).toHaveBeenCalledWith(
      'capabilityOverrides',
      expect.objectContaining({ 'test-capability': 'mod-a' })
    )
  })

  it('setUserOverride 校验 moduleId — 未注册模块不生效', async () => {
    registry.register(createCapability({ moduleId: 'mod-a' }))

    await arbiter.setUserOverride('test-capability', 'nonexistent-module')

    const override = arbiter.getUserOverride('test-capability')
    expect(override).toBeUndefined()
  })

  it('getUserOverride 对未设置的能力返回 undefined', () => {
    expect(arbiter.getUserOverride('nonexistent')).toBeUndefined()
  })

  it('清除用户覆盖', async () => {
    registry.register(createCapability({ moduleId: 'mod-a' }))

    await arbiter.setUserOverride('test-capability', 'mod-a')
    expect(arbiter.getUserOverride('test-capability')).toBe('mod-a')

    await arbiter.clearUserOverride('test-capability')
    expect(arbiter.getUserOverride('test-capability')).toBeUndefined()
  })

  it('清除用户覆盖后仲裁回退到 priority', async () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 1 }))
    registry.register(createCapability({ moduleId: 'mod-b', priority: 100 }))

    await arbiter.setUserOverride('test-capability', 'mod-b')
    await arbiter.clearUserOverride('test-capability')

    const result = await arbiter.arbitrate({
      capabilityName: 'test-capability',
      params: {}
    })
    expect(result!.selectedModuleId).toBe('mod-a')
    expect(result!.reason).toBe('priority')
  })

  it('清除未设置的覆盖不报错', async () => {
    await expect(arbiter.clearUserOverride('nonexistent')).resolves.toBeUndefined()
  })

  // ── 多能力隔离 ──

  it('不同能力的仲裁互不影响', async () => {
    registry.register(createCapability({ name: 'cap-a', moduleId: 'mod-a', priority: 10 }))
    registry.register(createCapability({ name: 'cap-b', moduleId: 'mod-b', priority: 20 }))

    const resultA = await arbiter.arbitrate({ capabilityName: 'cap-a', params: {} })
    const resultB = await arbiter.arbitrate({ capabilityName: 'cap-b', params: {} })

    expect(resultA!.selectedModuleId).toBe('mod-a')
    expect(resultB!.selectedModuleId).toBe('mod-b')
  })

  // ── 持久化重启测试 ──

  it('用户覆盖在模拟重启后仍然生效', async () => {
    registry.register(createCapability({ moduleId: 'mod-a', priority: 1 }))
    registry.register(createCapability({ moduleId: 'mod-b', priority: 100 }))

    await arbiter.setUserOverride('test-capability', 'mod-b')

    const newArbiter = new CapabilityArbiter(registry, config, logger)

    const result = await newArbiter.arbitrate({
      capabilityName: 'test-capability',
      params: {}
    })
    expect(result!.selectedModuleId).toBe('mod-b')
    expect(result!.reason).toBe('user_override')
  })
})
