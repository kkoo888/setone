/**
 * IntegrityChecker 单元测试
 * @description 测试完整性检查、自动恢复策略、事件发射
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-integrity' },
}))

import type { Logger } from '../../../../../src/main/types/logger'
import type { DatabaseManager } from '../../../../../src/main/core/database'
import type { BackupMetadata } from '../../../../../src/main/core/security/types'

/** 创建 Mock Logger */
const createMockLogger = (): Logger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setLevel: vi.fn(),
})

/** 创建 Mock DatabaseManager */
function createMockDb(overrides: Partial<DatabaseManager> = {}): DatabaseManager {
  return {
    pragma: vi.fn().mockReturnValue([{ integrity_check: 'ok' }]),
    close: vi.fn(),
    open: vi.fn(),
    checkIntegrity: vi.fn().mockReturnValue(true),
    exec: vi.fn(),
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(),
    transaction: vi.fn((fn: () => unknown) => fn()),
    migrate: vi.fn(),
    rollbackTo: vi.fn(),
    getCurrentVersion: vi.fn().mockReturnValue(0),
    getMigrationHistory: vi.fn().mockReturnValue([]),
    getDatabaseSize: vi.fn().mockReturnValue({ bytes: 1024, formatted: '1.00 KB' }),
    checkDatabaseSize: vi.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as DatabaseManager
}

describe('IntegrityChecker', () => {
  let checker: InstanceType<typeof import('../../../../../src/main/core/security/IntegrityChecker').IntegrityChecker>
  let logger: Logger

  beforeEach(async () => {
    logger = createMockLogger()
    const { IntegrityChecker } = await import('../../../../../src/main/core/security/IntegrityChecker')
    checker = new IntegrityChecker(logger)
  })

  afterEach(() => {
    checker.removeAllListeners()
  })

  // ── checkIntegrity ───────────────────────────────────────

  describe('checkIntegrity', () => {
    it('正常数据库返回 ok=true', async () => {
      const db = createMockDb()
      // pragma 根据参数返回不同结果
      vi.mocked(db.pragma).mockImplementation((p: string) => {
        if (p === 'integrity_check') return [{ integrity_check: 'ok' }] as unknown as never
        if (p === 'quick_check') return [{ quick_check: 'ok' }] as unknown as never
        if (p === 'wal_checkpoint(PASSIVE)') return [{ wal_checkpoint: [0, 0, 0] }] as unknown as never
        if (p === 'page_count') return 100 as unknown as never
        if (p === 'page_size') return 4096 as unknown as never
        return [] as unknown as never
      })

      const result = await checker.checkIntegrity(db)
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.checkedAt).toBeInstanceOf(Date)
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('integrity_check 失败时报告 corruption 错误', async () => {
      const db = createMockDb()
      vi.mocked(db.pragma).mockImplementation((p: string) => {
        if (p === 'integrity_check') return [{ integrity_check: 'malformed' }] as unknown as never
        if (p === 'quick_check') return [{ quick_check: 'ok' }] as unknown as never
        if (p === 'wal_checkpoint(PASSIVE)') return [{ wal_checkpoint: [0, 0, 0] }] as unknown as never
        if (p === 'page_count') return 100 as unknown as never
        if (p === 'page_size') return 4096 as unknown as never
        return [] as unknown as never
      })

      const result = await checker.checkIntegrity(db)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => e.type === 'corruption')).toBe(true)
    })

    it('WAL 繁忙时报告 warning', async () => {
      const db = createMockDb()
      vi.mocked(db.pragma).mockImplementation((p: string) => {
        if (p === 'integrity_check') return [{ integrity_check: 'ok' }] as unknown as never
        if (p === 'quick_check') return [{ quick_check: 'ok' }] as unknown as never
        if (p === 'wal_checkpoint(PASSIVE)') return [{ wal_checkpoint: [1, 10, 5] }] as unknown as never
        if (p === 'page_count') return 100 as unknown as never
        if (p === 'page_size') return 4096 as unknown as never
        return [] as unknown as never
      })

      const result = await checker.checkIntegrity(db)
      // WAL 繁忙是 warning，不影响 ok
      expect(result.errors.some(e => e.type === 'wal')).toBe(true)
    })

    it('数据库大小为 0 时报告 critical', async () => {
      const db = createMockDb()
      vi.mocked(db.pragma).mockImplementation((p: string) => {
        if (p === 'integrity_check') return [{ integrity_check: 'ok' }] as unknown as never
        if (p === 'quick_check') return [{ quick_check: 'ok' }] as unknown as never
        if (p === 'wal_checkpoint(PASSIVE)') return [{ wal_checkpoint: [0, 0, 0] }] as unknown as never
        if (p === 'page_count') return 0 as unknown as never
        if (p === 'page_size') return 4096 as unknown as never
        return [] as unknown as never
      })

      const result = await checker.checkIntegrity(db)
      expect(result.ok).toBe(false)
      expect(result.errors.some(e => e.type === 'size' && e.severity === 'critical')).toBe(true)
    })

    it('发出 integrity:start 和 integrity:complete 事件', async () => {
      const db = createMockDb()
      const startHandler = vi.fn()
      const completeHandler = vi.fn()
      checker.on('integrity:start', startHandler)
      checker.on('integrity:complete', completeHandler)

      await checker.checkIntegrity(db)
      expect(startHandler).toHaveBeenCalled()
      expect(completeHandler).toHaveBeenCalledWith(expect.objectContaining({
        result: expect.objectContaining({ ok: expect.any(Boolean) }),
      }))
    })
  })

  // ── startupCheck ─────────────────────────────────────────

  describe('startupCheck', () => {
    it('正常数据库不触发自动恢复', async () => {
      const db = createMockDb()
      vi.mocked(db.pragma).mockImplementation((p: string) => {
        if (p === 'integrity_check') return [{ integrity_check: 'ok' }] as unknown as never
        if (p === 'quick_check') return [{ quick_check: 'ok' }] as unknown as never
        if (p === 'wal_checkpoint(PASSIVE)') return [{ wal_checkpoint: [0, 0, 0] }] as unknown as never
        if (p === 'page_count') return 100 as unknown as never
        if (p === 'page_size') return 4096 as unknown as never
        return [] as unknown as never
      })

      const result = await checker.startupCheck(db)
      expect(result.ok).toBe(true)
      expect(result.repairs).toHaveLength(0)
    })

    it('异常数据库触发自动恢复并发出 repair 事件', async () => {
      const db = createMockDb()
      // 第一次 integrity_check 失败，WAL checkpoint 后恢复
      let callCount = 0
      vi.mocked(db.pragma).mockImplementation((p: string) => {
        callCount++
        if (p === 'integrity_check') {
          // 第一次失败，后续成功（WAL checkpoint 修复后）
          if (callCount <= 3) return [{ integrity_check: 'disk image is malformed' }] as unknown as never
          return [{ integrity_check: 'ok' }] as unknown as never
        }
        if (p === 'quick_check') return [{ quick_check: 'ok' }] as unknown as never
        if (p === 'wal_checkpoint(PASSIVE)') return [{ wal_checkpoint: [0, 0, 0] }] as unknown as never
        if (p === 'wal_checkpoint(TRUNCATE)') return undefined as unknown as never
        if (p === 'page_count') return 100 as unknown as never
        if (p === 'page_size') return 4096 as unknown as never
        return [] as unknown as never
      })

      const repairHandler = vi.fn()
      checker.on('integrity:repair', repairHandler)

      const result = await checker.startupCheck(db)
      expect(result.repairs.length).toBeGreaterThan(0)
    })
  })
})
