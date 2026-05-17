import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type { Logger } from '../types/logger'

export class DatabaseManager {
  private db: Database.Database
  private dbPath: string
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger

    const dbDir = join(app.getPath('userData'), 'data')
    mkdirSync(dbDir, { recursive: true })

    this.dbPath = join(dbDir, 'assistant.db')
    this.db = new Database(this.dbPath)

    // 启用 WAL 模式提升并发性能
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')

    this.logger.info('数据库已连接', { path: this.dbPath })
  }

  /** 执行 PRAGMA 指令 */
  pragma<T = unknown>(pragma: string): T {
    return this.db.pragma(pragma) as T
  }

  /** 重新打开数据库连接（用于恢复后重建连接） */
  open(): void {
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
    this.logger.info('数据库连接已重新打开', { path: this.dbPath })
  }

  /**
   * 执行迁移（事务包裹，失败自动回滚）
   * 每个迁移可选提供 `down` SQL 用于回滚，未提供时该迁移不可回滚
   */
  migrate(migrations: Array<{
    version: number
    sql: string
    down?: string
    description?: string
  }>): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version     INTEGER PRIMARY KEY,
        description TEXT,
        down_sql    TEXT,
        checksum    TEXT NOT NULL,
        applied_at  TEXT DEFAULT (datetime('now'))
      )
    `)

    // 确保旧版 migrations 表也有 checksum 列（幂等升级）
    try {
      this.db.prepare('SELECT checksum FROM migrations LIMIT 0').get()
    } catch {
      this.db.exec('ALTER TABLE migrations ADD COLUMN checksum TEXT NOT NULL DEFAULT ""')
      this.logger.info('migrations 表已升级，新增 checksum 列')
    }

    const applied = this.db
      .prepare('SELECT version, checksum FROM migrations ORDER BY version')
      .all() as Array<{ version: number; checksum: string }>

    const appliedVersions = new Map(applied.map(r => [r.version, r.checksum]))
    const sorted = migrations.sort((a, b) => a.version - b.version)

    // 计算迁移 SQL 的 SHA-256 校验和
    const computeChecksum = (sql: string): string =>
      createHash('sha256').update(sql, 'utf8').digest('hex')

    // 校验已应用迁移的完整性（防止 SQL 被篡改）— 必须在过滤 pending 之前执行
    for (const migration of sorted) {
      const existingChecksum = appliedVersions.get(migration.version)
      if (existingChecksum !== undefined) {
        const currentChecksum = computeChecksum(migration.sql)
        if (existingChecksum !== '' && existingChecksum !== currentChecksum) {
          throw new Error(
            `迁移 v${migration.version} 校验和不匹配！` +
            `预期: ${existingChecksum}，实际: ${currentChecksum}。` +
            `迁移 SQL 可能已被篡改，中止执行。`
          )
        }
      }
    }

    const pending = sorted.filter(m => !appliedVersions.has(m.version))

    if (pending.length === 0) {
      this.logger.info('无待执行迁移')
      return
    }

    // 事务包裹：全部成功才提交，任一失败自动回滚
    const runMigrations = this.db.transaction(() => {
      for (const migration of pending) {
        const checksum = computeChecksum(migration.sql)
        this.db.exec(migration.sql)
        this.db.prepare(
          'INSERT INTO migrations (version, description, down_sql, checksum) VALUES (?, ?, ?, ?)'
        ).run(migration.version, migration.description ?? null, migration.down ?? null, checksum)
        this.logger.info(`迁移 v${migration.version} 已执行`, {
          description: migration.description,
          hasDown: !!migration.down,
          checksum
        })
      }
    })

    try {
      runMigrations()
      this.logger.info(`迁移完成，共执行 ${pending.length} 个迁移`)
    } catch (err) {
      this.logger.error('迁移执行失败，已回滚', err as Error)
      throw err
    }
  }

  /**
   * 回滚到指定版本（降序执行 down SQL）
   * 目标版本本身会被保留，仅回滚比它更新的迁移
   */
  rollbackTo(
    targetVersion: number,
    migrations: Array<{ version: number; sql: string; down?: string }>
  ): void {
    const applied = this.db
      .prepare('SELECT version, down_sql FROM migrations ORDER BY version DESC')
      .all() as Array<{ version: number; down_sql: string | null }>

    const toRollback = applied.filter(r => r.version > targetVersion)

    if (toRollback.length === 0) {
      this.logger.info(`当前已在 v${targetVersion} 或更早版本，无需回滚`)
      return
    }

    // 检查所有待回滚迁移是否都有 down SQL
    const missingDown = toRollback.filter(r => !r.down_sql)
    if (missingDown.length > 0) {
      const versions = missingDown.map(r => `v${r.version}`).join(', ')
      throw new Error(
        `以下迁移缺少回滚 SQL，无法回滚: ${versions}。` +
        `请为这些迁移补充 down 字段或手动处理。`
      )
    }

    const downSqlMap = new Map(
      migrations.filter(m => m.down).map(m => [m.version, m.down!])
    )

    const runRollback = this.db.transaction(() => {
      for (const record of toRollback) {
        const downSql = downSqlMap.get(record.version) ?? record.down_sql
        if (!downSql) {
          throw new Error(`迁移 v${record.version} 缺少回滚 SQL`)
        }
        this.db.exec(downSql)
        this.db.prepare('DELETE FROM migrations WHERE version = ?').run(record.version)
        this.logger.info(`迁移 v${record.version} 已回滚`)
      }
    })

    try {
      runRollback()
      this.logger.info(`回滚完成，共回滚 ${toRollback.length} 个迁移，当前版本 v${targetVersion}`)
    } catch (err) {
      this.logger.error('回滚执行失败，事务已回滚', err as Error)
      throw err
    }
  }

  /**
   * 获取已应用的迁移历史（按版本排序）
   */
  getMigrationHistory(): Array<{
    version: number
    description: string | null
    hasDown: boolean
    checksum: string
    applied_at: string
  }> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version     INTEGER PRIMARY KEY,
        description TEXT,
        down_sql    TEXT,
        checksum    TEXT NOT NULL DEFAULT '',
        applied_at  TEXT DEFAULT (datetime('now'))
      )
    `)

    const rows = this.db.prepare(
      'SELECT version, description, down_sql IS NOT NULL as hasDown, checksum, applied_at FROM migrations ORDER BY version'
    ).all() as Array<{
      version: number
      description: string | null
      hasDown: number
      checksum: string
      applied_at: string
    }>

    return rows.map(r => ({
      ...r,
      hasDown: !!r.hasDown
    }))
  }

  /**
   * 获取当前数据库的迁移版本（最新已应用版本）
   * @returns 最新版本号，无迁移记录时返回 0
   */
  getCurrentVersion(): number {
    try {
      const row = this.db.prepare(
        'SELECT MAX(version) as version FROM migrations'
      ).get() as { version: number | null } | undefined
      return row?.version ?? 0
    } catch {
      return 0
    }
  }

  /** 执行原始 SQL（DDL/批量语句） */
  exec(sql: string): void {
    this.db.exec(sql)
  }

  /** 执行 SQL（带参数） */
  run(sql: string, ...params: unknown[]): Database.RunResult {
    return this.db.prepare(sql).run(...params)
  }

  /** 查询单条 */
  get<T = unknown>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined
  }

  /** 查询多条 */
  all<T = unknown>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...params) as T[]
  }

  /** 查询多条（async，兼容模块类型定义中的 query 接口） */
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return params ? this.all<T>(sql, ...params) : this.all<T>(sql)
  }

  /** 事务 */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  /** 完整性检查 */
  checkIntegrity(): boolean {
    try {
      const result = this.db.pragma('integrity_check') as Array<{ integrity_check: string }>
      return result[0]?.integrity_check === 'ok'
    } catch {
      return false
    }
  }

  /**
   * 获取数据库文件大小
   * 使用 PRAGMA page_count × page_size 计算
   */
  getDatabaseSize(): { bytes: number; formatted: string } {
    const pageCount = this.db.pragma('page_count', { simple: true }) as number
    const pageSize = this.db.pragma('page_size', { simple: true }) as number
    const bytes = pageCount * pageSize

    return { bytes, formatted: this.formatBytes(bytes) }
  }

  /**
   * 检查数据库大小是否超过阈值，超过时输出警告日志
   */
  checkDatabaseSize(thresholdBytes: number = 500 * 1024 * 1024): boolean {
    const { bytes, formatted } = this.getDatabaseSize()

    if (bytes > thresholdBytes) {
      this.logger.warn(
        `数据库大小超过阈值: ${formatted}（阈值: ${this.formatBytes(thresholdBytes)}）`,
        { dbPath: this.dbPath, currentBytes: bytes, thresholdBytes }
      )
      return true
    }

    this.logger.debug(`数据库大小: ${formatted}`)
    return false
  }

  /** 字节数转人类可读格式 */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const value = bytes / Math.pow(1024, i)
    return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`
  }

  /** 关闭数据库 */
  close(): void {
    this.db.close()
    this.logger.info('数据库已关闭')
  }
}
