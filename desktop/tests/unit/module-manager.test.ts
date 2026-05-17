import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ModuleManager } from '../../src/main/core/module-manager'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-app' }
}))

vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn()
  }))
}))

const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
})

describe('ModuleManager', () => {
  let manager: ModuleManager

  beforeEach(() => {
    vi.clearAllMocks()
    const mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn()
    } as unknown as import('../../src/main/types/event').EventBus
    const mockConfig = {
      get: vi.fn().mockResolvedValue([]),
      set: vi.fn().mockResolvedValue(undefined),
      getModuleConfig: vi.fn().mockResolvedValue(undefined),
      setModuleConfig: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteModuleConfig: vi.fn().mockResolvedValue(undefined),
      onChange: vi.fn()
    } as unknown as import('../../src/main/types/config').ConfigManager
    const mockAI = {} as unknown as import('../../src/main/types/ai').AIService
    const mockDB = {
      query: vi.fn(),
      run: vi.fn(),
      get: vi.fn(),
      transaction: vi.fn(),
      backup: vi.fn(),
      close: vi.fn()
    } as unknown as import('../../src/main/types/database').DatabaseManager

    manager = new ModuleManager(mockEventBus, mockConfig, mockAI, mockDB)
  })

  it('getModules 返回数组', () => {
    const modules = manager.getModules()
    expect(Array.isArray(modules)).toBe(true)
  })

  it('getModule 不存在时返回 undefined', () => {
    expect(manager.getModule('nonexistent')).toBeUndefined()
  })
})
