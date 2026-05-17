import { describe, it, expect } from 'vitest'
import { DependencyResolver } from '../../src/main/core/dependency-resolver'
import type { ScannedModule } from '../../src/main/core/module-scanner'

const createModule = (id: string, dependencies: string[] = []): ScannedModule => ({
  meta: {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    author: '',
    dependencies,
    provides: [],
    consumes: [],
    enabled: true,
    priority: 100,
    resourceLimits: { maxMemoryMB: 128, maxCpuPercent: 20 },
    hostVersion: '1.0.0',
    settings: {}
  },
  path: `/tmp/${id}`,
  hash: `hash-${id}`
})

describe('DependencyResolver', () => {
  const resolver = new DependencyResolver()

  it('无依赖模块正确排序', () => {
    const modules = [createModule('a'), createModule('b'), createModule('c')]
    const result = resolver.resolve(modules)
    expect(result.order).toHaveLength(3)
    expect(result.errors).toHaveLength(0)
  })

  it('线性依赖正确排序', () => {
    const modules = [
      createModule('c', ['b']),
      createModule('b', ['a']),
      createModule('a')
    ]
    const result = resolver.resolve(modules)
    expect(result.order).toEqual(['a', 'b', 'c'])
    expect(result.errors).toHaveLength(0)
  })

  it('循环依赖不阻塞其他模块', () => {
    const modules = [
      createModule('a', ['b']),
      createModule('b', ['a']),
      createModule('c')
    ]
    const result = resolver.resolve(modules)
    expect(result.order).toContain('c')
    expect(result.order).not.toContain('a')
    expect(result.order).not.toContain('b')
    expect(result.errors.filter(e => e.type === 'circular').length).toBeGreaterThanOrEqual(2)
  })

  it('缺失依赖报错但不阻塞其他模块', () => {
    const modules = [
      createModule('a', ['missing-dep']),
      createModule('b')
    ]
    const result = resolver.resolve(modules)
    expect(result.order).toContain('b')
    expect(result.errors.some(e => e.type === 'missing')).toBe(true)
  })

  it('依赖循环模块的普通模块仍可加载', () => {
    const modules = [
      createModule('a', ['b']),
      createModule('b', ['a']),
      createModule('d', ['a']),
      createModule('e')
    ]
    const result = resolver.resolve(modules)
    expect(result.order).toContain('e')
    expect(result.order).toContain('d')
    expect(result.order).not.toContain('a')
    expect(result.order).not.toContain('b')
  })
})
