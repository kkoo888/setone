import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdirSync, rmSync } from 'fs'
import type { Logger } from '../../types/logger'

// 每次测试用独立目录，避免状态污染
let testDir: string
let testCounter = 0

vi.mock('electron', () => ({
  app: { getPath: () => testDir }
}))

const createMockLogger = (): Logger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setLevel: vi.fn()
})

describe('DatabaseManager', () => {
  let dbManager: InstanceType<typeof import('../../src/main/core/database').DatabaseManager>
  let logger: Logger

  beforeEach(async () => {
    testCounter++
    testDir = join('/tmp', `test-db-${process.pid}-${testCounter}`)
    mkdirSync(join(testDir, 'data'), { recursive: true })
    logger = createMockLogger()
    const { DatabaseManager } = await import('../../src/main/core/database')
    dbManager = new DatabaseManager(logger)
  })

  afterEach(() => {
    try { dbManager.close() } catch { /* already closed */ }
    try { rmSync(testDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  // ── 构造函数与初始化 ──────────────────────────────────────

  describe('构造函数与初始化', () => {
    it('构造函数创建实例并记录连接日志', () => {
      expect(dbManager).toBeDefined()
      expect(logger.info).toHaveBeenCalledWith(
        '数据库已连接',
        expect.objectContaining({ path: expect.stringContaining('assistant.db') })
      )
    })

    it('WAL 模式已启用', () => {
      const result = dbManager.pragma<Array<{ journal_mode: string }>>('journal_mode')
      expect(result[0].journal_mode).toBe('wal')
    })

    it('外键约束已启用', () => {
      const result = dbManager.pragma<Array<{ foreign_keys: number }>>('foreign_keys')
      expect(result[0].foreign_keys).toBe(1)
    })
  })

  // ── run / get / all 方法 ──────────────────────────────────

  describe('run / get / all', () => {
    beforeEach(() => {
      dbManager.run('CREATE TABLE test_tbl (id INTEGER PRIMARY KEY, name TEXT)')
    })

    it('run 执行 INSERT 并返回 RunResult', () => {
      const result = dbManager.run('INSERT INTO test_tbl (name) VALUES (?)', 'hello')
      expect(result.changes).toBe(1)
      expect(result.lastInsertRowid).toBe(1)
    })

    it('get 查询单条记录', () => {
      dbManager.run('INSERT INTO test_tbl (name) VALUES (?)', 'hello')
      const row = dbManager.get<{ id: number; name: string }>('SELECT * FROM test_tbl WHERE id = ?', 1)
      expect(row).toEqual({ id: 1, name: 'hello' })
    })

    it('get 查询不存在的记录返回 undefined', () => {
      const row = dbManager.get<{ id: number; name: string }>('SELECT * FROM test_tbl WHERE id = ?', 999)
      expect(row).toBeUndefined()
    })

    it('all 查询多条记录', () => {
      dbManager.run('INSERT INTO test_tbl (name) VALUES (?)', 'a')
      dbManager.run('INSERT INTO test_tbl (name) VALUES (?)', 'b')
      dbManager.run('INSERT INTO test_tbl (name) VALUES (?)', 'c')
      const rows = dbManager.all<{ id: number; name: string }>('SELECT * FROM test_tbl ORDER BY id')
      expect(rows).toHaveLength(3)
      expect(rows[0].name).toBe('a')
      expect(rows[2].name).toBe('c')
    })

    it('all 查询空表返回空数组', () => {
      const rows = dbManager.all<{ id: number; name: string }>('SELECT * FROM test_tbl')
      expect(rows).toEqual([])
    })

    it('参数化查询防止 SQL 注入', () => {
      dbManager.run('INSERT INTO test_tbl (name) VALUES (?)', "'; DROP TABLE test_tbl;--")
      const row = dbManager.get<{ name: string }>('SELECT name FROM test_tbl WHERE id = ?', 1)
      expect(row?.name).toBe("'; DROP TABLE test_tbl;--")
    })
  })

  // ── exec 方法 ─────────────────────────────────────────────

  describe('exec', () => {
    it('执行 DDL 语句', () => {
      dbManager.exec('CREATE TABLE exec_test (id INTEGER PRIMARY KEY, value TEXT)')
      dbManager.run('INSERT INTO exec_test (value) VALUES (?)', 'test')
      const row = dbManager.get<{ value: string }>('SELECT value FROM exec_test WHERE id = 1')
      expect(row?.value).toBe('test')
    })

    it('执行多条语句', () => {
      dbManager.exec(`
        CREATE TABLE multi1 (id INTEGER PRIMARY KEY);
        CREATE TABLE multi2 (id INTEGER PRIMARY KEY);
      `)
      dbManager.run('INSERT INTO multi1 (id) VALUES (?)', 1)
      dbManager.run('INSERT INTO multi2 (id) VALUES (?)', 1)
      expect(dbManager.get<{ id: number }>('SELECT id FROM multi1')).toEqual({ id: 1 })
      expect(dbManager.get<{ id: number }>('SELECT id FROM multi2')).toEqual({ id: 1 })
    })
  })

  // ── transaction 方法 ──────────────────────────────────────

  describe('transaction', () => {
    beforeEach(() => {
      dbManager.exec('CREATE TABLE IF NOT EXISTS txn_test (id INTEGER PRIMARY KEY, name TEXT)')
    })

    it('事务提交后数据持久化', () => {
      dbManager.transaction(() => {
        dbManager.run('INSERT INTO txn_test (name) VALUES (?)', 'first')
        dbManager.run('INSERT INTO txn_test (name) VALUES (?)', 'second')
      })
      const rows = dbManager.all<{ name: string }>('SELECT name FROM txn_test ORDER BY id')
      expect(rows).toHaveLength(2)
      expect(rows[0].name).toBe('first')
      expect(rows[1].name).toBe('second')
    })

    it('事务异常时自动回滚', () => {
      expect(() => {
        dbManager.transaction(() => {
          dbManager.run('INSERT INTO txn_test (name) VALUES (?)', 'first')
          throw new Error('rollback')
        })
      }).toThrow('rollback')

      const count = dbManager.get<{ count: number }>('SELECT COUNT(*) as count FROM txn_test')
      expect(count?.count).toBe(0)
    })

    it('事务返回值', () => {
      const result = dbManager.transaction(() => {
        dbManager.run('INSERT INTO txn_test (name) VALUES (?)', 'test')
        return 'ok'
      })
      expect(result).toBe('ok')
    })
  })

  // ── migrate 方法 ──────────────────────────────────────────

  describe('migrate', () => {
    it('按版本号顺序执行迁移', () => {
      dbManager.migrate([
        {
          version: 1,
          sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
          down: 'DROP TABLE IF EXISTS users',
          description: '创建用户表'
        },
        {
          version: 2,
          sql: 'ALTER TABLE users ADD COLUMN email TEXT',
          down: 'ALTER TABLE users DROP COLUMN email',
          description: '添加邮箱字段'
        }
      ])

      dbManager.run('INSERT INTO users (name, email) VALUES (?, ?)', 'test', 'test@example.com')
      const user = dbManager.get<{ name: string; email: string }>('SELECT * FROM users WHERE id = 1')
      expect(user?.name).toBe('test')
      expect(user?.email).toBe('test@example.com')

      const history = dbManager.getMigrationHistory()
      expect(history).toHaveLength(2)
      expect(history[0].hasDown).toBe(true)
    })

    it('跳过已执行的迁移', () => {
      dbManager.migrate([{ version: 1, sql: 'CREATE TABLE skip_test (id INTEGER PRIMARY KEY)' }])
      dbManager.migrate([{ version: 1, sql: 'CREATE TABLE skip_test (id INTEGER PRIMARY KEY)' }])
      expect(logger.info).toHaveBeenCalledWith('无待执行迁移')
    })

    it('迁移失败时回滚，不记录版本号', () => {
      dbManager.migrate([{ version: 1, sql: 'CREATE TABLE m_test (id INTEGER PRIMARY KEY)' }])

      expect(() => {
        dbManager.migrate([{ version: 2, sql: 'INVALID SQL SYNTAX' }])
      }).toThrow()

      const applied = dbManager.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM migrations WHERE version = 2'
      )
      expect(applied?.count).toBe(0)
    })

    it('乱序输入仍按版本号排序执行', () => {
      dbManager.migrate([
        { version: 3, sql: 'CREATE TABLE sort_test (id INTEGER PRIMARY KEY, v INTEGER)' },
        { version: 1, sql: 'CREATE TABLE sort_base (id INTEGER PRIMARY KEY)' }
      ])
      dbManager.run('INSERT INTO sort_base (id) VALUES (?)', 1)
      dbManager.run('INSERT INTO sort_test (v) VALUES (?)', 42)
      expect(dbManager.get<{ v: number }>('SELECT v FROM sort_test')?.v).toBe(42)
    })

    it('down SQL 为可选字段，不影响正常迁移', () => {
      dbManager.migrate([
        { version: 1, sql: 'CREATE TABLE no_down (id INTEGER PRIMARY KEY)' }
      ])
      const history = dbManager.getMigrationHistory()
      expect(history[0].hasDown).toBe(false)
    })

    it('迁移执行后记录正确的校验和', () => {
      dbManager.migrate([
        { version: 1, sql: 'CREATE TABLE checksum_test (id INTEGER PRIMARY KEY)', description: '校验和测试' }
      ])
      const history = dbManager.getMigrationHistory()
      const entry = history.find(h => h.version === 1)
      expect(entry).toBeDefined()
      expect(entry!.checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('SQL 被篡改时校验和不匹配，中止执行', () => {
      dbManager.migrate([
        { version: 1, sql: 'CREATE TABLE tamper_test (id INTEGER PRIMARY KEY)', description: '防篡改测试' }
      ])

      expect(() => {
        dbManager.migrate([
          { version: 1, sql: 'CREATE TABLE tamper_test (id INTEGER PRIMARY KEY, extra TEXT)', description: '被篡改' }
        ])
      }).toThrow(/校验和不匹配/)
    })

    it('不同 SQL 产生不同的校验和', async () => {
      const { createHash } = await import('crypto')
      const hash1 = createHash('sha256').update('CREATE TABLE a (id INTEGER)', 'utf8').digest('hex')
      const hash2 = createHash('sha256').update('CREATE TABLE b (id INTEGER)', 'utf8').digest('hex')
      expect(hash1).not.toBe(hash2)
    })
  })

  // ── rollbackTo 方法 ─────────────────────────────────────

  describe('rollbackTo', () => {
    it('回滚到指定版本，撤销更新的迁移', () => {
      const migrations = [
        { version: 1, sql: 'CREATE TABLE rb_test (id INTEGER PRIMARY KEY, name TEXT)', down: 'DROP TABLE IF EXISTS rb_test' },
        { version: 2, sql: 'ALTER TABLE rb_test ADD COLUMN age INTEGER', down: 'ALTER TABLE rb_test DROP COLUMN age' },
        { version: 3, sql: 'ALTER TABLE rb_test ADD COLUMN email TEXT', down: 'ALTER TABLE rb_test DROP COLUMN email' }
      ]

      dbManager.migrate(migrations)
      expect(dbManager.getCurrentVersion()).toBe(3)

      dbManager.rollbackTo(1, migrations)
      expect(dbManager.getCurrentVersion()).toBe(1)

      const history = dbManager.getMigrationHistory()
      expect(history).toHaveLength(1)
      expect(history[0].version).toBe(1)
    })

    it('已在目标版本时无需回滚', () => {
      dbManager.migrate([
        { version: 1, sql: 'CREATE TABLE rb_noop (id INTEGER PRIMARY KEY)', down: 'DROP TABLE IF EXISTS rb_noop' }
      ])

      dbManager.rollbackTo(1, [])
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('无需回滚'))
    })

    it('缺少 down SQL 时抛出错误', () => {
      dbManager.migrate([
        { version: 1, sql: 'CREATE TABLE rb_nodown (id INTEGER PRIMARY KEY)' }
      ])

      expect(() => {
        dbManager.rollbackTo(0, [{ version: 1, sql: 'CREATE TABLE rb_nodown (id INTEGER PRIMARY KEY)' }])
      }).toThrow(/缺少回滚 SQL/)
    })

    it('回滚事务性：全部成功或全部失败', () => {
      const migrations = [
        { version: 1, sql: 'CREATE TABLE rb_txn (id INTEGER PRIMARY KEY)', down: 'DROP TABLE IF EXISTS rb_txn' },
        { version: 2, sql: 'INSERT INTO rb_txn (id) VALUES (1)', down: 'DELETE FROM rb_txn WHERE id = 1' }
      ]

      dbManager.migrate(migrations)
      dbManager.rollbackTo(0, migrations)
      expect(dbManager.getCurrentVersion()).toBe(0)
    })
  })

  // ── getCurrentVersion 方法 ────────────────────────────────

  describe('getCurrentVersion', () => {
    it('无迁移记录时返回 0', () => {
      const version = dbManager.getCurrentVersion()
      expect(version).toBe(0)
    })

    it('执行迁移后返回最新版本', () => {
      dbManager.migrate([
        { version: 88, sql: 'CREATE TABLE cv_test (id INTEGER PRIMARY KEY)' }
      ])
      expect(dbManager.getCurrentVersion()).toBe(88)
    })
  })

  // ── getMigrationHistory 方法 ──────────────────────────────

  describe('getMigrationHistory', () => {
    it('返回已应用迁移的历史记录', () => {
      dbManager.migrate([
        {
          version: 77,
          sql: 'CREATE TABLE hist_test (id INTEGER PRIMARY KEY)',
          description: '历史测试',
          down: 'DROP TABLE IF EXISTS hist_test'
        }
      ])

      const history = dbManager.getMigrationHistory()
      expect(history.length).toBe(1)
      expect(history[0].version).toBe(77)
      expect(history[0].description).toBe('历史测试')
      expect(history[0].hasDown).toBe(true)
      expect(history[0].checksum).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  // ── pragma 方法 ──────────────────────────────────────────

  describe('pragma', () => {
    it('查询 WAL 模式', () => {
      const result = dbManager.pragma<Array<{ journal_mode: string }>>('journal_mode')
      expect(result).toEqual([{ journal_mode: 'wal' }])
    })

    it('查询 busy_timeout', () => {
      const result = dbManager.pragma('busy_timeout')
      // better-sqlite3 pragma 返回格式可能是数组或对象
      expect(result).toBeDefined()
    })

    it('查询 page_size', () => {
      const result = dbManager.pragma('page_size')
      expect(result).toBeDefined()
    })
  })

  // ── open 方法 ─────────────────────────────────────────────

  describe('open', () => {
    it('重新打开数据库后可正常读写', () => {
      dbManager.exec('CREATE TABLE IF NOT EXISTS reopen (id INTEGER PRIMARY KEY, val TEXT)')
      dbManager.run('INSERT INTO reopen (val) VALUES (?)', 'before')
      dbManager.close()

      dbManager.open()
      expect(logger.info).toHaveBeenCalledWith(
        '数据库连接已重新打开',
        expect.objectContaining({ path: expect.stringContaining('assistant.db') })
      )

      const row = dbManager.get<{ val: string }>('SELECT val FROM reopen WHERE id = 1')
      expect(row?.val).toBe('before')
    })

    it('重新打开后 WAL 模式仍然启用', () => {
      dbManager.close()
      dbManager.open()
      const result = dbManager.pragma<Array<{ journal_mode: string }>>('journal_mode')
      expect(result[0].journal_mode).toBe('wal')
    })
  })

  // ── checkIntegrity ────────────────────────────────────────

  describe('checkIntegrity', () => {
    it('正常数据库返回 true', () => {
      expect(dbManager.checkIntegrity()).toBe(true)
    })
  })

  // ── getDatabaseSize ───────────────────────────────────────

  describe('getDatabaseSize', () => {
    it('返回正数大小和可读格式', () => {
      const size = dbManager.getDatabaseSize()
      expect(size.bytes).toBeGreaterThan(0)
      expect(size.formatted).toMatch(/^\d+(\.\d+)?\s+(B|KB|MB|GB|TB)$/)
    })

    it('数据增长后大小增加', () => {
      dbManager.exec('CREATE TABLE IF NOT EXISTS size_test (id INTEGER PRIMARY KEY, data TEXT)')
      const before = dbManager.getDatabaseSize()

      dbManager.transaction(() => {
        for (let i = 0; i < 1000; i++) {
          dbManager.run('INSERT INTO size_test (data) VALUES (?)', `row-${'x'.repeat(100)}-${i}`)
        }
      })

      const after = dbManager.getDatabaseSize()
      expect(after.bytes).toBeGreaterThan(before.bytes)
    })
  })

  // ── checkDatabaseSize ─────────────────────────────────────

  describe('checkDatabaseSize', () => {
    it('未超过阈值返回 false 并记录 debug', () => {
      const exceeded = dbManager.checkDatabaseSize(1024 * 1024 * 1024)
      expect(exceeded).toBe(false)
      expect(logger.debug).toHaveBeenCalled()
    })

    it('超过阈值返回 true 并输出 warn', () => {
      const exceeded = dbManager.checkDatabaseSize(1)
      expect(exceeded).toBe(true)
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('数据库大小超过阈值'),
        expect.any(Object)
      )
    })
  })

  // ── close ─────────────────────────────────────────────────

  describe('close', () => {
    it('关闭数据库并记录日志', () => {
      dbManager.close()
      expect(logger.info).toHaveBeenCalledWith('数据库已关闭')
    })

    it('关闭后操作抛出异常', () => {
      dbManager.close()
      expect(() => {
        dbManager.run('SELECT 1')
      }).toThrow()
    })
  })
})
