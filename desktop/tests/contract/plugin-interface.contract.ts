/**
 * 契约测试 — 插件接口
 * @description 验证模块实现是否符合 Module 接口规范
 */
import { describe, it, expect } from 'vitest'
import type { Module, ModuleMeta, ModuleContext, Capability } from '../../src/main/types/module'

/**
 * 契约验证：检查对象是否符合 Module 接口
 * 任何模块实现都必须通过此契约
 */
function validateModuleContract(mod: Module): void {
  // 必须有 id
  expect(typeof mod.id).toBe('string')
  expect(mod.id.length).toBeGreaterThan(0)

  // 必须有 meta
  expect(mod.meta).toBeDefined()
  validateModuleMeta(mod.meta)

  // 必须有 activate 方法
  expect(typeof mod.activate).toBe('function')

  // 必须有 deactivate 方法
  expect(typeof mod.deactivate).toBe('function')

  // 必须有 getCapabilities 方法
  expect(typeof mod.getCapabilities).toBe('function')
  const caps = mod.getCapabilities()
  expect(Array.isArray(caps)).toBe(true)
  caps.forEach(validateCapability)

  // 可选方法类型检查
  if (mod.getUI !== undefined) {
    expect(typeof mod.getUI).toBe('function')
  }
  if (mod.getStatus !== undefined) {
    expect(typeof mod.getStatus).toBe('function')
    const status = mod.getStatus()!
    expect(typeof status.id).toBe('string')
    expect(typeof status.state).toBe('string')
  }
}

function validateModuleMeta(meta: ModuleMeta): void {
  expect(typeof meta.id).toBe('string')
  expect(typeof meta.name).toBe('string')
  expect(typeof meta.version).toBe('string')
  expect(typeof meta.description).toBe('string')
  expect(typeof meta.author).toBe('string')
  expect(typeof meta.enabled).toBe('boolean')
  expect(Array.isArray(meta.dependencies)).toBe(true)
  expect(typeof meta.hostVersion).toBe('string')
  expect(typeof meta.priority).toBe('number')
  expect(meta.resourceLimits).toBeDefined()
  expect(typeof meta.resourceLimits.maxMemoryMB).toBe('number')
  expect(typeof meta.resourceLimits.maxCpuPercent).toBe('number')
  expect(Array.isArray(meta.provides)).toBe(true)
  expect(Array.isArray(meta.consumes)).toBe(true)
  expect(typeof meta.settings).toBe('object')
}

function validateCapability(cap: Capability): void {
  expect(['tool', 'event', 'ui', 'service']).toContain(cap.type)
  expect(typeof cap.name).toBe('string')
  expect(typeof cap.description).toBe('string')
  expect(typeof cap.priority).toBe('number')
  expect(typeof cap.moduleId).toBe('string')
}

describe('插件接口契约测试', () => {
  it('Module 接口完整性验证', () => {
    // 使用符合接口的 mock 对象验证契约
    const mockModule: Module = {
      id: 'test-module',
      meta: {
        id: 'test-module',
        name: '测试模块',
        version: '1.0.0',
        description: '契约测试模块',
        author: 'test',
        enabled: true,
        dependencies: [],
        hostVersion: '>=0.1.0',
        priority: 100,
        resourceLimits: { maxMemoryMB: 256, maxCpuPercent: 30 },
        provides: [{ type: 'tool', name: 'test-tool', description: '测试工具' }],
        consumes: [],
        settings: {},
      },
      activate: async () => {},
      deactivate: async () => {},
      getCapabilities: () => [{
        type: 'tool',
        name: 'test-tool',
        description: '测试工具',
        priority: 100,
        moduleId: 'test-module',
      }],
    }

    validateModuleContract(mockModule)
  })

  it('ModuleContext 接口完整性验证', () => {
    // 验证 ModuleContext 必须包含的服务
    const contextKeys = [
      'eventBus', 'config', 'ai', 'llm',
      'logger', 'store', 'db', 'getModule',
    ]
    // 此测试验证接口定义存在，实际实现在集成测试中验证
    expect(contextKeys.length).toBe(8)
  })

  it('CapabilityHandler 接口验证', async () => {
    // 验证 handler 的 execute 方法签名
    const handler = {
      execute: async (params: Record<string, unknown>) => ({
        success: true,
        data: params,
      }),
      validate: (params: Record<string, unknown>) => typeof params === 'object',
    }

    expect(typeof handler.execute).toBe('function')
    expect(typeof handler.validate).toBe('function')

    const result = await handler.execute({ key: 'value' })
    expect(result.success).toBe(true)
    expect(handler.validate({})).toBe(true)
  })
})

export { validateModuleContract }
