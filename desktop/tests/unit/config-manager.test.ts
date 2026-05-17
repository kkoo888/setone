import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-config' }
}))

// Mock fs sync methods
vi.mock('fs', () => {
  const store = new Map<string, string>()
  return {
    readFileSync: vi.fn((path: string) => {
      const data = store.get(path)
      if (data === undefined) throw new Error(`ENOENT: ${path}`)
      return data
    }),
    writeFileSync: vi.fn((path: string, data: string) => {
      store.set(path, data)
    }),
    existsSync: vi.fn((path: string) => store.has(path)),
    mkdirSync: vi.fn(),
    __store: store
  }
})

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined)
}))

// Helper to get the mock fs store
function getStore(): Map<string, string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as { __store: Map<string, string> }
  return fs.__store
}

beforeEach(() => {
  vi.clearAllMocks()
  getStore().clear()
})

describe('ConfigManagerImpl', () => {
  async function createConfig() {
    const { ConfigManagerImpl } = await import('../../src/main/core/config-manager')
    return new ConfigManagerImpl()
  }

  describe('get / set 基本读写', () => {
    it('get 返回默认值当键不存在', async () => {
      const config = await createConfig()
      const value = await config.get('nonexistent', 'default')
      expect(value).toBe('default')
    })

    it('get 返回 undefined 当键不存在且无默认值', async () => {
      const config = await createConfig()
      const value = await config.get('nonexistent')
      expect(value).toBeUndefined()
    })

    it('set/get 顶层键读写', async () => {
      const config = await createConfig()
      await config.set('theme', 'dark')
      const value = await config.get('theme')
      expect(value).toBe('dark')
    })

    it('set/get 嵌套键读写', async () => {
      const config = await createConfig()
      await config.set('ollama.model', 'llama3')
      const value = await config.get('ollama.model')
      expect(value).toBe('llama3')
    })

    it('set/get 深层嵌套键', async () => {
      const config = await createConfig()
      await config.set('a.b.c.d', 'deep')
      const value = await config.get('a.b.c.d')
      expect(value).toBe('deep')
    })

    it('set 覆盖已有值', async () => {
      const config = await createConfig()
      await config.set('key', 'old')
      await config.set('key', 'new')
      const value = await config.get('key')
      expect(value).toBe('new')
    })

    it('get 嵌套键时中间路径返回默认值', async () => {
      const config = await createConfig()
      await config.set('a.b.c', 'value')
      const value = await config.get('a.x.c', 'fallback')
      expect(value).toBe('fallback')
    })
  })

  describe('delete 支持嵌套键', () => {
    it('删除顶层键', async () => {
      const config = await createConfig()
      await config.set('key', 'value')
      await config.delete('key')
      expect(await config.get('key')).toBeUndefined()
    })

    it('删除嵌套键不影响同级键', async () => {
      const config = await createConfig()
      await config.set('a.b.c', 'remove')
      await config.set('a.b.d', 'keep')
      await config.delete('a.b.c')
      expect(await config.get('a.b.c')).toBeUndefined()
      expect(await config.get('a.b.d')).toBe('keep')
    })

    it('删除嵌套键后清理空父对象', async () => {
      const config = await createConfig()
      await config.set('x.y.z', 'only')
      await config.delete('x.y.z')
      expect(await config.get('x')).toBeUndefined()
    })

    it('删除嵌套键后保留非空父对象', async () => {
      const config = await createConfig()
      await config.set('x.y.z', 'remove')
      await config.set('x.w', 'keep')
      await config.delete('x.y.z')
      expect(await config.get('x.y')).toBeUndefined()
      expect(await config.get('x.w')).toBe('keep')
    })

    it('删除不存在的键不报错', async () => {
      const config = await createConfig()
      await config.delete('nonexistent')
      // 不应抛出异常
    })

    it('删除不存在的嵌套路径不报错', async () => {
      const config = await createConfig()
      await config.delete('a.b.c.d.e')
      // 不应抛出异常
    })
  })

  describe('模块配置隔离', () => {
    it('getModuleConfig/setModuleConfig 基本读写', async () => {
      const config = await createConfig()
      await config.setModuleConfig('ollama', 'apiKey', 'abc123')
      const value = await config.getModuleConfig('ollama', 'apiKey')
      expect(value).toBe('abc123')
    })

    it('模块配置支持嵌套键', async () => {
      const config = await createConfig()
      await config.setModuleConfig('ollama', 'settings.model', 'llama3')
      const value = await config.getModuleConfig('ollama', 'settings.model')
      expect(value).toBe('llama3')
    })

    it('getModuleConfig 返回默认值', async () => {
      const config = await createConfig()
      const value = await config.getModuleConfig('unknown', 'key', 'default')
      expect(value).toBe('default')
    })

    it('不同模块配置互相隔离', async () => {
      const config = await createConfig()
      await config.setModuleConfig('moduleA', 'key', 'valueA')
      await config.setModuleConfig('moduleB', 'key', 'valueB')
      expect(await config.getModuleConfig('moduleA', 'key')).toBe('valueA')
      expect(await config.getModuleConfig('moduleB', 'key')).toBe('valueB')
    })

    it('deleteModuleConfig 删除模块配置', async () => {
      const config = await createConfig()
      await config.setModuleConfig('mod', 'key', 'value')
      await config.deleteModuleConfig('mod', 'key')
      expect(await config.getModuleConfig('mod', 'key')).toBeUndefined()
    })

    it('deleteModuleConfig 支持嵌套键并清理空父对象', async () => {
      const config = await createConfig()
      await config.setModuleConfig('mod', 'a.b.c', 'value')
      await config.deleteModuleConfig('mod', 'a.b.c')
      expect(await config.getModuleConfig('mod', 'a')).toBeUndefined()
    })

    it('模块配置不影响全局配置', async () => {
      const config = await createConfig()
      await config.set('key', 'global')
      await config.setModuleConfig('mod', 'key', 'module')
      expect(await config.get('key')).toBe('global')
      expect(await config.getModuleConfig('mod', 'key')).toBe('module')
    })
  })

  describe('onChange 监听配置变更', () => {
    it('set 触发 onChange 回调', async () => {
      const config = await createConfig()
      const callback = vi.fn()
      config.onChange(callback)
      await config.set('key', 'value')
      expect(callback).toHaveBeenCalledWith('key', 'value')
    })

    it('delete 触发 onChange 回调', async () => {
      const config = await createConfig()
      const callback = vi.fn()
      await config.set('key', 'value')
      config.onChange(callback)
      await config.delete('key')
      expect(callback).toHaveBeenCalledWith('key', undefined)
    })

    it('setModuleConfig 触发 onChange 回调', async () => {
      const config = await createConfig()
      const callback = vi.fn()
      config.onChange(callback)
      await config.setModuleConfig('myModule', 'apiKey', 'abc123')
      expect(callback).toHaveBeenCalledWith('module.myModule.apiKey', 'abc123')
    })

    it('deleteModuleConfig 触发 onChange 回调', async () => {
      const config = await createConfig()
      const callback = vi.fn()
      await config.setModuleConfig('mod', 'key', 'value')
      config.onChange(callback)
      await config.deleteModuleConfig('mod', 'key')
      expect(callback).toHaveBeenCalledWith('module.mod.key', undefined)
    })

    it('onChange 返回取消监听函数', async () => {
      const config = await createConfig()
      const callback = vi.fn()
      const unsubscribe = config.onChange(callback)

      await config.set('key1', 'v1')
      expect(callback).toHaveBeenCalledTimes(1)

      unsubscribe()

      await config.set('key2', 'v2')
      expect(callback).toHaveBeenCalledTimes(1) // 不再被调用
    })

    it('多个监听器独立工作', async () => {
      const config = await createConfig()
      const cb1 = vi.fn()
      const cb2 = vi.fn()

      const unsub1 = config.onChange(cb1)
      config.onChange(cb2)

      await config.set('key', 'v1')
      expect(cb1).toHaveBeenCalledTimes(1)
      expect(cb2).toHaveBeenCalledTimes(1)

      unsub1()
      await config.set('key2', 'v2')
      expect(cb1).toHaveBeenCalledTimes(1) // 已取消
      expect(cb2).toHaveBeenCalledTimes(2)
    })
  })
})
