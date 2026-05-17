/**
 * better-sqlite3 Mock 工厂
 * @description 模拟 SQLite 数据库行为，用于不依赖真实数据库的测试
 */
import { vi } from 'vitest'

/** 创建 Mock Database 实例 */
export function createMockDatabase() {
  const tables = new Map<string, Map<number, Record<string, unknown>>>()
  let autoIncrement = new Map<string, number>()
  let inTransaction = false

  const mockPrepare = vi.fn((sql: string) => {
    const normalizedSql = sql.trim().toLowerCase()

    return {
      run: vi.fn((...params: unknown[]) => {
        // 模拟 INSERT
        if (normalizedSql.startsWith('insert')) {
          const match = sql.match(/into\s+(\w+)/i)
          if (match) {
            const table = match[1]
            if (!tables.has(table)) tables.set(table, new Map())
            if (!autoIncrement.has(table)) autoIncrement.set(table, 0)
            const id = autoIncrement.get(table)! + 1
            autoIncrement.set(table, id)
            tables.get(table)!.set(id, { id, ...params.reduce((acc: Record<string, unknown>, val, i) => ({ ...acc, [`col${i}`]: val }), {} as Record<string, unknown>) })
          }
        }
        return { changes: 1, lastInsertRowid: autoIncrement.get('default') ?? 1 }
      }),
      get: vi.fn((...params: unknown[]) => {
        // 模拟 SELECT 单条 — 返回 undefined（空结果）
        return undefined
      }),
      all: vi.fn((...params: unknown[]) => {
        // 模拟 SELECT 多条 — 返回空数组
        return []
      }),
      iterate: vi.fn(function* () {
        // 空迭代器
      }),
      pluck: vi.fn().mockReturnThis(),
      expand: vi.fn().mockReturnThis(),
      raw: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      columns: vi.fn().mockReturnValue([]),
      reader: vi.fn().mockReturnThis(),
    }
  })

  const mockPragma = vi.fn((pragma: string, options?: { simple?: boolean }) => {
    const pragmas: Record<string, unknown> = {
      journal_mode: [{ journal_mode: 'wal' }],
      foreign_keys: [{ foreign_keys: 1 }],
      busy_timeout: [{ busy_timeout: 5000 }],
      synchronous: [{ synchronous: 1 }],
      integrity_check: [{ integrity_check: 'ok' }],
      page_count: options?.simple ? 100 : [{ page_count: 100 }],
      page_size: options?.simple ? 4096 : [{ page_size: 4096 }],
    }
    return pragmas[pragma] ?? []
  })

  return {
    prepare: mockPrepare,
    exec: vi.fn(),
    pragma: mockPragma,
    transaction: vi.fn(<T>(fn: () => T) => {
      return (...args: unknown[]) => {
        inTransaction = true
        try {
          const result = fn()
          inTransaction = false
          return result
        } catch (err) {
          inTransaction = false
          throw err
        }
      }
    }),
    close: vi.fn(),
    open: vi.fn(),
    function: vi.fn(),
    aggregate: vi.fn(),
    backup: vi.fn(),
    serialize: vi.fn(),
    walCheckpoint: vi.fn(),
    defaultSafeIntegers: vi.fn().mockReturnThis(),
    unsafeMode: vi.fn().mockReturnThis(),
    // 测试辅助方法
    _tables: tables,
    _inTransaction: () => inTransaction,
  }
}

/** 创建 Mock Database 构造函数 */
export function createMockDatabaseConstructor() {
  return vi.fn().mockImplementation(() => createMockDatabase())
}
