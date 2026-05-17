/**
 * 契约测试 — 数据库接口
 * @description 验证数据库管理器实现是否符合 DatabaseManager 接口规范
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdirSync, rmSync } from 'fs'
import type { Logger } from '../../src/main/types/logger'

let testDir: string
let testCounter = 0

vi.mock('electron', () => ({
  app: { getPath: () => testDir },
}))

const createMockLogger = (): Logger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setLevel: vi.fn(),
})

/**
 * 契约验证：DatabaseManager 必须实现的方法
 */
function validateDatabaseContract(db: any): void {
  // 核心 CRUD
  expect(typeof db.run).toBe('function')
  expect(typeof db.get).toBe('function')
  expect(typeof db.all).toBe('function')
  expect(typeof db.exec).toBe('function')

  // 事务
  expect(typeof db.transaction).toBe('function')

  // 迁移
  expect(typeof db.migrate).toBe('function')
  expect(typeof db.rollbackTo).toBe('function')
  expect(typeof db.getCurrentVersion).toBe('function')
  expect(typeof db.getMigrationHistory).toBe('function')

  // 维护
  expect(typeof db.pragma).toBe('function')
  expect(typeof db.checkIntegrity).toBe('function')
  expect(typeof db.getDatabaseSize).toBe('function')
  expect(typeof db.checkDatabaseSize).toBe('function')
  expect(typeof db.close).toBe('function')
  expect(typeof db.open).toBe('function')
}

describe('数据库接口契约测试', () => {
  let dbManager: any
  let logger: Logger

  beforeEach(async () => {
    testCounter++
    testDir = join('/tmp', `test-db-contract-${process.pid}-${testCounter}`)
    mkdirSync(join(testDir, 'data'), { recursive: true })
    logger = createMockLogger()
    const { DatabaseManager } = await import('../../../src/main/core/database')
    dbManager = new DatabaseManager(logger)
  })

  afterEach(() => {
    try { dbManager.close() } catch { /* ignore */ }
    try { rmSync(testDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('DatabaseManager 实现所有必须方法', () => {
    validateDatabaseContract(dbManager)
  })

  it('run 返回 RunResult（changes + lastInsertRowid）', () => {
    dbManager.exec('CREATE TABLE contract_run (id INTEGER PRIMARY KEY, val TEXT)')
    const result = dbManager.run('INSERT INTO contract_run (val) VALUES (?)', 'test')
    expect(result).toBeDefined()
    expect(typeof result.changes).toBe('number')
    expect(result.changes).toBe(1)
  })

  it('get 返回单条或 undefined', () => {
    dbManager.exec('CREATE TABLE contract_get (id INTEGER PRIMARY KEY, val TEXT)')
    dbManager.run('INSERT INTO contract_get (val) VALUES (?)', 'test')

    const found = dbManager.get('SELECT * FROM contract_get WHERE id = ?', 1)
    expect(found).toBeDefined()

    const notFound = dbManager.get('SELECT * FROM contract_get WHERE id = ?', 999)
    expect(notFound).toBeUndefined()
  })

  it('all 返回数组', () => {
    dbManager.exec('CREATE TABLE contract_all (id INTEGER PRIMARY KEY)')
    dbManager.run('INSERT INTO contract_all (id) VALUES (?)', 1)
    const rows = dbManager.all('SELECT * FROM contract_all')
    expect(Array.isArray(rows)).toBe(true)
  })

  it('transaction 保证原子性', () => {
    dbManager.exec('CREATE TABLE contract_txn (id INTEGER PRIMARY KEY)')
    expect(() => {
      dbManager.transaction(() => {
        dbManager.run('INSERT INTO contract_txn (id) VALUES (?)', 1)
        throw new Error('rollback')
      })
    }).toThrow()
    expect(dbManager.all('SELECT * FROM contract_txn')).toHaveLength(0)
  })

  it('migrate 支持版本管理和校验和', () => {
    dbManager.migrate([{
      version: 1,
      sql: 'CREATE TABLE contract_mig (id INTEGER PRIMARY KEY)',
      description: '契约迁移',
    }])
    expect(dbManager.getCurrentVersion()).toBe(1)
    const history = dbManager.getMigrationHistory()
    expect(history).toHaveLength(1)
    expect(history[0].checksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('getDatabaseSize 返回 bytes + formatted', () => {
    const size = dbManager.getDatabaseSize()
    expect(typeof size.bytes).toBe('number')
    expect(typeof size.formatted).toBe('string')
    expect(size.formatted).toMatch(/\d/)
  })
})

export { validateDatabaseContract }
