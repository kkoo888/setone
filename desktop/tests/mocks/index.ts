/**
 * Mock 工厂统一导出
 * @description 集中导出所有 Mock 工厂，方便测试文件统一引入
 */
export { createMockElectron, createMockBrowserWindow, createMockIpcMain } from './electron'
export { createMockDatabase, createMockDatabaseConstructor } from './better-sqlite3'
export {
  createMockOllamaClient,
  createMockChatResponse,
  createMockStreamResponse,
  createMockEmbeddingResponse,
  createMockFetch,
  MOCK_MODELS_RESPONSE,
} from './ollama'

import { vi } from 'vitest'
import type { Logger } from '../../src/main/types/logger'

/** 创建通用 Mock Logger */
export function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  }
}

/** 创建 Mock ConfigManager */
export function createMockConfigManager(initialConfig: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(
    Object.entries(initialConfig).map(([k, v]) => [k, v])
  )

  return {
    get: vi.fn(async <T>(key: string, defaultValue?: T): Promise<T> => {
      return (store.get(key) ?? defaultValue) as T
    }),
    set: vi.fn(async <T>(key: string, value: T): Promise<void> => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string): Promise<void> => {
      store.delete(key)
    }),
    getModuleConfig: vi.fn(async <T>(moduleId: string, key: string, defaultValue?: T): Promise<T> => {
      const fullKey = `module.${moduleId}.${key}`
      return (store.get(fullKey) ?? defaultValue) as T
    }),
    setModuleConfig: vi.fn(async <T>(moduleId: string, key: string, value: T): Promise<void> => {
      store.set(`module.${moduleId}.${key}`, value)
    }),
    deleteModuleConfig: vi.fn(async (moduleId: string, key: string): Promise<void> => {
      store.delete(`module.${moduleId}.${key}`)
    }),
    onChange: vi.fn(() => () => {}),
    // 测试辅助
    _store: store,
  }
}

/** 创建 Mock AIService */
export function createMockAIService() {
  return {
    chat: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: '测试回复' },
      done: true,
    }),
    chatStream: vi.fn(async function* () {
      yield { message: { content: '测试' }, done: false }
      yield { message: { content: '' }, done: true }
    }),
    analyzeImage: vi.fn().mockResolvedValue('图片分析结果'),
    recognizeIntent: vi.fn().mockResolvedValue({
      intent: 'general',
      confidence: 0.9,
      params: {},
    }),
    embed: vi.fn().mockResolvedValue(Array.from({ length: 384 }, () => 0)),
  }
}

/** 创建 Mock ScopedStore */
export function createMockScopedStore() {
  const memStore = new Map<string, unknown>()
  const persistStore = new Map<string, unknown>()

  return {
    get: vi.fn(<T>(key: string) => memStore.get(key) as T | undefined),
    set: vi.fn(<T>(key: string, value: T) => { memStore.set(key, value) }),
    delete: vi.fn((key: string) => { memStore.delete(key) }),
    getPersist: vi.fn(async <T>(key: string) => persistStore.get(key) as T | undefined),
    setPersist: vi.fn(async <T>(key: string, value: T) => { persistStore.set(key, value) }),
    deletePersist: vi.fn(async (key: string) => { persistStore.delete(key) }),
    _memStore: memStore,
    _persistStore: persistStore,
  }
}

/** 创建 Mock ScopedEventBus */
export function createMockScopedEventBus() {
  const handlers = new Map<string, Set<(data: unknown) => void | Promise<void>>>()

  return {
    on: vi.fn((event: string, handler: (data: unknown) => void | Promise<void>) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
    }),
    off: vi.fn((event: string, handler: (data: unknown) => void | Promise<void>) => {
      handlers.get(event)?.delete(handler)
    }),
    emit: vi.fn((event: string, data?: unknown) => {
      handlers.get(event)?.forEach(h => h(data))
    }),
    // 测试辅助
    _handlers: handlers,
  }
}
