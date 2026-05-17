import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ModuleValidator } from '../../src/main/core/module-validator'
import type { Logger } from '../../src/main/types/logger'

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setLevel: vi.fn()
}

describe('ModuleValidator', () => {
  let validator: ModuleValidator

  beforeEach(() => {
    vi.clearAllMocks()
    validator = new ModuleValidator(mockLogger)
  })

  describe('validateModuleJson', () => {
    const validJson = {
      id: 'test-module',
      name: 'Test Module',
      version: '1.0.0',
      description: 'A test module'
    }

    it('合法 module.json 通过校验', () => {
      const result = validator.validateModuleJson(validJson)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('非对象输入报错', () => {
      expect(validator.validateModuleJson(null).valid).toBe(false)
      expect(validator.validateModuleJson('string').valid).toBe(false)
      expect(validator.validateModuleJson([1, 2]).valid).toBe(false)
    })

    it('缺少必填字段报错', () => {
      const result = validator.validateModuleJson({ name: 'x', version: '1.0.0' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('id'))).toBe(true)
    })

    it('非法模块 ID 报错', () => {
      const result = validator.validateModuleJson({ ...validJson, id: '123-invalid!' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('ID'))).toBe(true)
    })

    it('大写 ID 报错', () => {
      const result = validator.validateModuleJson({ ...validJson, id: 'UpperCase' })
      expect(result.valid).toBe(false)
    })

    it('合法 ID 通过', () => {
      const result = validator.validateModuleJson({ ...validJson, id: 'my-module-2' })
      expect(result.valid).toBe(true)
    })

    it('非法版本号报错', () => {
      const result = validator.validateModuleJson({ ...validJson, version: 'abc' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Semver'))).toBe(true)
    })

    it('合法版本号通过', () => {
      const result = validator.validateModuleJson({ ...validJson, version: '1.2.3-beta.1' })
      expect(result.valid).toBe(true)
    })

    it('重复依赖报错', () => {
      const result = validator.validateModuleJson({
        ...validJson,
        dependencies: ['dep-a', 'dep-a']
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('重复'))).toBe(true)
    })

    it('priority 范围校验', () => {
      const result = validator.validateModuleJson({ ...validJson, priority: 9999 })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('priority'))).toBe(true)
    })

    it('priority 为负数报错', () => {
      const result = validator.validateModuleJson({ ...validJson, priority: -1 })
      expect(result.valid).toBe(false)
    })

    it('priority 合法值通过', () => {
      const result = validator.validateModuleJson({ ...validJson, priority: 500 })
      expect(result.valid).toBe(true)
    })

    it('name 超长报错', () => {
      const result = validator.validateModuleJson({
        ...validJson,
        name: 'x'.repeat(200)
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('名称长度'))).toBe(true)
    })

    it('description 非字符串报错', () => {
      const result = validator.validateModuleJson({ ...validJson, description: 123 as never })
      expect(result.valid).toBe(false)
    })
  })

  describe('validateDependencies', () => {
    const registered = new Set(['core', 'logger', 'database'])

    it('所有依赖已注册则通过', () => {
      const result = validator.validateDependencies(['core', 'logger'], registered)
      expect(result.valid).toBe(true)
    })

    it('未知依赖报错', () => {
      const result = validator.validateDependencies(['core', 'unknown-module'], registered)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('unknown-module'))).toBe(true)
    })

    it('空依赖列表通过', () => {
      const result = validator.validateDependencies([], registered)
      expect(result.valid).toBe(true)
    })

    it('非字符串依赖报错', () => {
      const result = validator.validateDependencies([123 as never], registered)
      expect(result.valid).toBe(false)
    })
  })

  describe('validateCapabilities', () => {
    it('合法能力声明通过', () => {
      const caps = [
        { name: 'handle-message', type: 'tool', description: 'Handles messages' }
      ]
      expect(validator.validateCapabilities(caps).valid).toBe(true)
    })

    it('非数组输入报错', () => {
      expect(validator.validateCapabilities('not-array').valid).toBe(false)
    })

    it('缺少 name 报错', () => {
      const caps = [{ type: 'tool' }]
      const result = validator.validateCapabilities(caps)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('name'))).toBe(true)
    })

    it('非法 type 报错', () => {
      const caps = [{ name: 'foo', type: 'invalid-type' }]
      const result = validator.validateCapabilities(caps)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('invalid-type'))).toBe(true)
    })

    it('重复 name 报错', () => {
      const caps = [
        { name: 'foo', type: 'tool' },
        { name: 'foo', type: 'service' }
      ]
      const result = validator.validateCapabilities(caps)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('重复'))).toBe(true)
    })

    it('空数组通过', () => {
      expect(validator.validateCapabilities([]).valid).toBe(true)
    })

    it('非法 name 格式报错', () => {
      const caps = [{ name: '123-bad', type: 'tool' }]
      const result = validator.validateCapabilities(caps)
      expect(result.valid).toBe(false)
    })

    it('description 非字符串报错', () => {
      const caps = [{ name: 'foo', type: 'tool', description: 123 }]
      const result = validator.validateCapabilities(caps)
      expect(result.valid).toBe(false)
    })
  })
})
