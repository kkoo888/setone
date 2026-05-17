/**
 * 集成测试 — 数据库插件
 * @description 测试数据库管理器与迁移系统的完整工作流
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdirSync, rmSync } from 'fs'
import type { Logger } from '../../../src/main/types/logger'

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

describe('数据库插件集成测试', () => {
  let dbManager: InstanceType<typeof import('../../../../src/main/core/database').DatabaseManager>
  let logger: Logger

  beforeEach(async () => {
    testCounter++
    testDir = join('/tmp', `test-db-integration-${process.pid}-${testCounter}`)
    mkdirSync(join(testDir, 'data'), { recursive: true })
    logger = createMockLogger()
    const { DatabaseManager } = await import('../../../../src/main/core/database')
    dbManager = new DatabaseManager(logger)
  })

  afterEach(() => {
    try { dbManager.close() } catch { /* ignore */ }
    try { rmSync(testDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  describe('完整迁移流程', () => {
    it('创建表 → 插入数据 → 查询 → 迁移升级 → 查询新字段', () => {
      // 第一次迁移：创建表
      dbManager.migrate([{
        version: 1,
        sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
        down: 'DROP TABLE IF EXISTS users',
        description: '创建用户表',
      }])

      // 插入数据
      dbManager.run('INSERT INTO users (name) VALUES (?)', 'Alice')
      dbManager.run('INSERT INTO users (name) VALUES (?)', 'Bob')

      // 查询验证
      const users = dbManager.all<{ id: number; name: string }>('SELECT * FROM users ORDER BY id')
      expect(users).toHaveLength(2)
      expect(users[0].name).toBe('Alice')

      // 第二次迁移：添加字段
      dbManager.migrate([
        { version: 1, sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)' },
        { version: 2, sql: 'ALTER TABLE users ADD COLUMN email TEXT', description: '添加邮箱' },
      ])

      // 新字段可查询
      dbManager.run('UPDATE users SET email = ? WHERE id = ?', 'alice@test.com', 1)
      const user = dbManager.get<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', 1)
      expect(user?.email).toBe('alice@test.com')
    })

    it('回滚 → 数据恢复 → 重新迁移', () => {
      const migrations = [
        { version: 1, sql: 'CREATE TABLE rb_int (id INTEGER PRIMARY KEY, val TEXT)', down: 'DROP TABLE IF EXISTS rb_int' },
        { version: 2, sql: 'ALTER TABLE rb_int ADD COLUMN extra TEXT', down: 'ALTER TABLE rb_int DROP COLUMN extra' },
      ]

      dbManager.migrate(migrations)
      dbManager.run('INSERT INTO rb_int (val, extra) VALUES (?, ?)', 'data', 'extra')
      expect(dbManager.getCurrentVersion()).toBe(2)

      // 回滚到 v1
      dbManager.rollbackTo(1, migrations)
      expect(dbManager.getCurrentVersion()).toBe(1)

      // 重新迁移
      dbManager.migrate(migrations)
      expect(dbManager.getCurrentVersion()).toBe(2)
    })
  })

  describe('事务与并发安全', () => {
    it('事务内多条操作全部成功或全部回滚', () => {
      dbManager.exec('CREATE TABLE txn_int (id INTEGER PRIMARY KEY, name TEXT)')

      // 成功事务
      dbManager.transaction(() => {
        dbManager.run('INSERT INTO txn_int (name) VALUES (?)', 'A')
        dbManager.run('INSERT INTO txn_int (name) VALUES (?)', 'B')
      })
      expect(dbManager.all('SELECT * FROM txn_int')).toHaveLength(2)

      // 失败事务
      expect(() => {
        dbManager.transaction(() => {
          dbManager.run('INSERT INTO txn_int (name) VALUES (?)', 'C')
          throw new Error('rollback')
        })
      }).toThrow()
      expect(dbManager.all('SELECT * FROM txn_int')).toHaveLength(2)
    })
  })

  describe('数据库维护', () => {
    it('完整性检查通过', () => {
      expect(dbManager.checkIntegrity()).toBe(true)
    })

    it('数据库大小跟踪', () => {
      dbManager.exec('CREATE TABLE size_int (id INTEGER PRIMARY KEY, data TEXT)')
      const before = dbManager.getDatabaseSize()

      dbManager.transaction(() => {
        for (let i = 0; i < 500; i++) {
          dbManager.run('INSERT INTO size_int (data) VALUES (?)', `row-${'x'.repeat(50)}-${i}`)
        }
      })

      const after = dbManager.getDatabaseSize()
      expect(after.bytes).toBeGreaterThan(before.bytes)
    })

    it('关闭后重新打开保留数据', () => {
      dbManager.exec('CREATE TABLE persist_int (id INTEGER PRIMARY KEY, val TEXT)')
      dbManager.run('INSERT INTO persist_int (val) VALUES (?)', 'persist')

      dbManager.close()
      dbManager.open()

      const row = dbManager.get<{ val: string }>('SELECT val FROM persist_int WHERE id = 1')
      expect(row?.val).toBe('persist')
    })
  })
})
