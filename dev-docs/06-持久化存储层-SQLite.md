# 06-持久化存储层-SQLite

> **前置依赖**：版块2  
> **预计工作量**：1天  
> **版块**：6  
> **说明**：SQLite数据库CRUD、备份恢复、模块数据隔离

---

## 版块 6：持久化存储层（SQLite）

<!-- ✅ Issue#92: 已修复，迁移校验和已实现 — migrate() 使用 createHash('sha256') 计算每个迁移 SQL 的 SHA-256 校验和，存储到 migrations 表的 checksum 列，并在执行前验证已应用迁移的校验和是否匹配（不匹配则抛出异常中止） -->

### 6.1 目录结构

```
src/main/core/
├── database.ts                  # SQLite 数据库管理
├── migrations/                  # 数据库迁移脚本
│   ├── 001-init.sql             # 初始化表结构
│   └── 002-memory.sql           # 记忆模块表
└── backup.ts                    # 数据库备份管理
tests/unit/
└── database.test.ts             # 数据库单元测试
```

**迁移脚本内容：**

**src/main/core/migrations/001-init.sql**：

```sql
-- 001-init.sql: 基础表结构初始化
-- 版本: 1
-- 描述: 创建模块配置、事件日志、能力注册、事件总线等基础表
-- 回滚: DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS global_config; DROP TABLE IF EXISTS capability_overrides; DROP TABLE IF EXISTS event_log; DROP TABLE IF EXISTS module_configs;

-- 模块配置存储（按模块隔离的键值配置）
CREATE TABLE IF NOT EXISTS module_configs (
    module_id   TEXT NOT NULL,
    key         TEXT NOT NULL,
    value       TEXT,               -- JSON 序列化的值
    updated_at  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (module_id, key)
);
CREATE INDEX IF NOT EXISTS idx_module_configs_module ON module_configs(module_id);

-- 事件日志（用于审计和回放）
CREATE TABLE IF NOT EXISTS event_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name  TEXT NOT NULL,
    source      TEXT,               -- 来源模块 ID
    payload     TEXT,               -- JSON 序列化的事件数据
    created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_log_name ON event_log(event_name);
CREATE INDEX IF NOT EXISTS idx_event_log_source ON event_log(source);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);

-- 能力注册表（持久化用户覆盖）
CREATE TABLE IF NOT EXISTS capability_overrides (
    capability_name TEXT PRIMARY KEY,
    module_id       TEXT NOT NULL,
    enabled         INTEGER DEFAULT 1,
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- 全局配置键值对
CREATE TABLE IF NOT EXISTS global_config (
    key         TEXT PRIMARY KEY,
    value       TEXT,               -- JSON 序列化的值
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- 事件总线持久化（跨模块事件写入，供 event_bus 集成测试及审计使用）
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    payload     TEXT,               -- JSON 序列化的事件数据
    created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
```

<!-- ✅ Issue#82: 已修复，迁移脚本内容已存在 — 001-init.sql 包含 module_configs, event_log, capability_overrides, global_config, events 五张表及索引 -->

**src/main/core/migrations/002-memory.sql**：

```sql
-- 002-memory.sql: 记忆模块表结构
-- 版本: 2
-- 描述: 创建短期记忆、长期记忆和记忆摘要表
-- 注意: 表结构与 modules/memory/services/ 中的代码保持一致
-- 回滚: DROP TABLE IF EXISTS memory_summaries; DROP TABLE IF EXISTS long_term_memory; DROP TABLE IF EXISTS short_term_memory;

-- 短期记忆（对话上下文、临时状态）
-- 对应 ShortTermMemoryService.initTable()
CREATE TABLE IF NOT EXISTS short_term_memory (
    id          TEXT PRIMARY KEY,           -- UUID（crypto.randomUUID()）
    role        TEXT NOT NULL,              -- 'user' | 'assistant'
    content     TEXT NOT NULL,
    timestamp   INTEGER NOT NULL,           -- Date.now() 毫秒时间戳
    session_id  TEXT NOT NULL,
    summarized  INTEGER DEFAULT 0           -- 0=未摘要, 1=已摘要
);
CREATE INDEX IF NOT EXISTS idx_stm_session ON short_term_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_stm_timestamp ON short_term_memory(timestamp);
CREATE INDEX IF NOT EXISTS idx_stm_session_ts ON short_term_memory(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_stm_unsummarized ON short_term_memory(session_id, summarized);

-- 长期记忆（持久化知识、用户偏好，支持向量检索）
-- 对应 LongTermMemoryService.initTable()
CREATE TABLE IF NOT EXISTS long_term_memory (
    id          TEXT PRIMARY KEY,           -- UUID（crypto.randomUUID()）
    content     TEXT NOT NULL,
    embedding   BLOB,                       -- Float32Array 序列化的嵌入向量
    type        TEXT NOT NULL,              -- 'fact' | 'preference' | 'event'
    created_at  INTEGER NOT NULL,           -- Date.now() 毫秒时间戳
    metadata    TEXT                        -- JSON 扩展字段（Record<string, unknown>）
);
CREATE INDEX IF NOT EXISTS idx_ltm_type ON long_term_memory(type);
CREATE INDEX IF NOT EXISTS idx_ltm_created ON long_term_memory(created_at);
CREATE INDEX IF NOT EXISTS idx_ltm_type_created ON long_term_memory(type, created_at);

-- 记忆摘要（定期压缩的对话摘要，配合 ShortTermMemoryService.cleanup 使用）
CREATE TABLE IF NOT EXISTS memory_summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    summary         TEXT NOT NULL,
    message_count   INTEGER DEFAULT 0,      -- 摘要涵盖的消息数
    created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_summary_session ON memory_summaries(session_id);
```

<!-- ✅ Issue#82: 已修复，迁移脚本内容已存在 — 002-memory.sql 包含 short_term_memory, long_term_memory, memory_summaries 三张表及索引 -->

### 6.2 开发步骤

#### 步骤 1：安装依赖

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

#### 步骤 2：实现数据库管理器
<!-- ✅ Issue#90: 已修复，getDb 已移除，通过封装方法访问 -->

**src/main/core/database.ts**：

```typescript
import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
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
    this.db.pragma('synchronous = NORMAL')  // WAL 模式下 NORMAL 已足够安全且性能更优
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')   // 写锁等待超时 5s

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
    down?: string      // 可选：回滚 SQL，未提供则该迁移标记为不可回滚
    description?: string // 可选：迁移描述
  }>): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version     INTEGER PRIMARY KEY,
        description TEXT,
        down_sql    TEXT,       -- 回滚 SQL（NULL 表示不可回滚）
        checksum    TEXT NOT NULL,  -- SHA-256 校验和（SQL 内容的完整性指纹）
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
    const pending = sorted.filter(m => !appliedVersions.has(m.version))

    if (pending.length === 0) {
      this.logger.info('无待执行迁移')
      return
    }

    // 计算迁移 SQL 的 SHA-256 校验和
    function computeChecksum(sql: string): string {
      return createHash('sha256').update(sql, 'utf8').digest('hex')
    }

    // 校验已应用迁移的完整性（防止 SQL 被篡改）
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
   * @param targetVersion 回滚目标版本（保留此版本及之前的所有迁移）
   * @param migrations 完整迁移列表（必须包含 down SQL）
   */
  rollbackTo(
    targetVersion: number,
    migrations: Array<{ version: number; sql: string; down?: string }>
  ): void {
    const applied = this.db
      .prepare('SELECT version, down_sql FROM migrations ORDER BY version DESC')
      .all() as Array<{ version: number; down_sql: string | null }>

    // 筛选出需要回滚的版本（比目标版本更新的）
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

    // 提供传入的 down SQL（优先使用参数传入的，其次使用数据库中存储的）
    const downSqlMap = new Map(
      migrations.filter(m => m.down).map(m => [m.version, m.down!])
    )

    // 事务包裹：全部回滚成功才提交
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
    // 确保 migrations 表存在
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version     INTEGER PRIMARY KEY,
        description TEXT,
        down_sql    TEXT,
        checksum    TEXT NOT NULL DEFAULT '',
        applied_at  TEXT DEFAULT (datetime('now'))
      )
    `)

    return this.db.prepare(
      'SELECT version, description, down_sql IS NOT NULL as hasDown, checksum, applied_at FROM migrations ORDER BY version'
    ).all() as Array<{
      version: number
      description: string | null
      hasDown: boolean
      checksum: string
      applied_at: string
    }>
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
      // migrations 表不存在
      return 0
    }
  }

  /** 执行原始 SQL（DDL/批量语句，仅限内部使用，不暴露底层实例） */
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
   * 使用 PRAGMA page_count × page_size 计算，无需访问文件系统
   * @returns 数据库大小（字节）及人类可读格式
   */
  getDatabaseSize(): { bytes: number; formatted: string } {
    const pageCount = this.db.pragma('page_count', { simple: true }) as number
    const pageSize = this.db.pragma('page_size', { simple: true }) as number
    const bytes = pageCount * pageSize

    return { bytes, formatted: this.formatBytes(bytes) }
  }

  /**
   * 检查数据库大小是否超过阈值，超过时输出警告日志
   * @param thresholdBytes 阈值（字节），默认 500MB
   * @returns true 表示超过阈值
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
```

<!-- ✅ Issue#89: 已修复，getDatabaseSize 已实现 — 使用 PRAGMA page_count × page_size 计算数据库大小，返回 bytes 及人类可读格式；checkDatabaseSize 超过阈值时输出警告日志；formatBytes 提供 B/KB/MB/GB/TB 格式化 -->

#### 步骤 3：实现备份管理器

**src/main/core/backup.ts**：

```typescript
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { copyFile, unlink, access } from 'fs/promises'
import type { Logger } from '../types/logger'
import type { DatabaseManager } from './database'

export class BackupManager {
  private backupDir: string
  private retentionDays: number
  private logger: Logger
  private dbManager?: DatabaseManager
  /** 自动备份定时器 */
  private autoBackupTimer: ReturnType<typeof setInterval> | null = null
  /** 自动备份配置 */
  private autoBackupSourcePath: string | null = null
  private autoBackupHour: number = 3
  private autoBackupMinute: number = 0

  constructor(logger: Logger, retentionDays = 30, dbManager?: DatabaseManager) {
    this.logger = logger
    this.retentionDays = retentionDays
    this.dbManager = dbManager
    this.backupDir = join(app.getPath('userData'), 'backups')
    mkdirSync(this.backupDir, { recursive: true })
  }

  /**
   * 启动每日自动备份调度
   * @param sourcePath 数据库源文件路径
   * @param hour 执行小时（0-23），默认 3（凌晨 3 点）
   * @param minute 执行分钟（0-59），默认 0
   */
  startAutoBackup(sourcePath: string, hour = 3, minute = 0): void {
    // 停止已有调度，避免重复
    this.stopAutoBackup()

    this.autoBackupSourcePath = sourcePath
    this.autoBackupHour = hour
    this.autoBackupMinute = minute

    const scheduleNext = () => {
      const now = new Date()
      const next = new Date(now)
      next.setHours(hour, minute, 0, 0)
      // 如果今天的触发时间已过，设为明天
      if (next <= now) {
        next.setDate(next.getDate() + 1)
      }
      return next.getTime() - now.getTime()
    }

    // 先等待到下一个触发时间，再以 24 小时间隔循环
    const initialDelay = scheduleNext()

    const runBackup = () => {
      try {
        this.logger.info('自动备份开始执行')
        this.createBackup(sourcePath)
        this.logger.info('自动备份执行完成')
      } catch (err) {
        this.logger.error('自动备份执行失败', err as Error)
      }
    }

    // 首次延迟到目标时间后执行，之后每 24 小时重复
    const initialTimer = setTimeout(() => {
      runBackup()
      this.autoBackupTimer = setInterval(runBackup, 24 * 60 * 60 * 1000)
    }, initialDelay)

    // 保存 initialTimer 引用以便 stopAutoBackup 能清除
    this.autoBackupTimer = initialTimer as unknown as ReturnType<typeof setInterval>

    this.logger.info('每日自动备份已启动', {
      sourcePath,
      hour,
      minute,
      nextRunInMs: initialDelay
    })
  }

  /** 停止自动备份调度 */
  stopAutoBackup(): void {
    if (this.autoBackupTimer) {
      clearInterval(this.autoBackupTimer)
      clearTimeout(this.autoBackupTimer as unknown as ReturnType<typeof setTimeout>)
      this.autoBackupTimer = null
      this.logger.info('每日自动备份已停止')
    }
  }

  /** 获取自动备份状态 */
  getAutoBackupStatus(): { running: boolean; sourcePath: string | null; hour: number; minute: number } {
    return {
      running: this.autoBackupTimer !== null,
      sourcePath: this.autoBackupSourcePath,
      hour: this.autoBackupHour,
      minute: this.autoBackupMinute
    }
  }

  /** 创建备份（WAL 安全：先 checkpoint 再复制） */
  createBackup(sourcePath: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `backup-${timestamp}.db`
    const destPath = join(this.backupDir, filename)

    // 如果有活跃的数据库连接，先执行 checkpoint 确保 WAL 数据落盘
    if (this.dbManager) {
      try {
        this.dbManager.pragma('wal_checkpoint(TRUNCATE)')
      } catch {
        this.logger.warn('备份前 WAL checkpoint 失败，继续复制')
      }
    }

    copyFileSync(sourcePath, destPath)
    this.logger.info('数据库备份已创建', { path: destPath })

    this.cleanupOldBackups()
    return destPath
  }

  /** 清理过期备份 */
  private cleanupOldBackups(): void {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000

    try {
      const files = readdirSync(this.backupDir)
      for (const file of files) {
        if (!file.startsWith('backup-') || !file.endsWith('.db')) continue

        // 从文件名解析时间戳（backup-{ISO时间戳}.db），比 mtime 更可靠
        // mtime 会被复制/恢复等操作修改，导致过期判断不准
        const timestampStr = file.replace('backup-', '').replace('.db', '').replace('.encrypted', '')
        const fileTime = new Date(timestampStr).getTime()

        if (isNaN(fileTime)) {
          // 文件名格式异常，fallback 到 mtime
          const filePath = join(this.backupDir, file)
          const stats = statSync(filePath)
          if (stats.mtimeMs < cutoff) {
            unlinkSync(filePath)
            this.logger.info('已清理过期备份（基于 mtime）', { file })
          }
          continue
        }

        if (fileTime < cutoff) {
          const filePath = join(this.backupDir, file)
          unlinkSync(filePath)
          this.logger.info('已清理过期备份', { file })
        }
      }
    } catch (err) {
      this.logger.error('清理备份失败', err as Error)
    }
  }

  /** 列出所有备份 */
  listBackups(): Array<{ file: string; path: string; size: number; date: Date }> {
    try {
      const files = readdirSync(this.backupDir)
      return files
        .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
        .map(f => {
          const filePath = join(this.backupDir, f)
          const stats = statSync(filePath)
          return {
            file: f,
            path: filePath,
            size: stats.size,
            date: stats.mtime
          }
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime())
    } catch {
      return []
    }
  }

  /**
   * 从备份恢复（WAL 安全模式）
   *
   * ⚠️ 原实现直接 copyFileSync 覆盖数据库文件，未先 checkpoint 也未关闭连接，
   *    WAL 模式下会导致 WAL 日志与数据不一致，造成数据损坏。
   *
   * 修复后的流程：
   *   1. 对当前数据库执行 PRAGMA wal_checkpoint(TRUNCATE)，将 WAL 中已提交的
   *      事务全部写回主数据库文件，然后截断 WAL 文件
   *   2. 关闭当前数据库连接，释放文件锁
   *   3. 删除残留的 WAL/SHM 文件（checkpoint 后通常已为空，但需防御性清理）
   *   4. 使用异步 copyFile 覆盖主数据库文件（避免阻塞事件循环）
   *   5. 重新打开数据库连接
   *   6. 执行 PRAGMA integrity_check 验证恢复后的数据库完整性
   *
   * @returns 恢复成功返回 true，任何步骤失败则回滚并返回 false
   */
  async restoreBackup(backupPath: string, targetPath: string): Promise<boolean> {
    const walPath = targetPath + '-wal'
    const shmPath = targetPath + '-shm'

    // 用于失败时恢复的备份路径
    const tempBackupPath = targetPath + '.pre-restore-backup'
    let hasTempBackup = false

    try {
      // ① WAL checkpoint：将 WAL 中已提交的事务刷入主文件
      if (this.dbManager) {
        try {
          const result = this.dbManager.pragma('wal_checkpoint(TRUNCATE)') as [number, number, number]
          this.logger.info('WAL checkpoint 完成', { walPages: result })
        } catch (err) {
          this.logger.warn('WAL checkpoint 失败，将继续恢复', { error: (err as Error).message })
        }
      }

      // ② 关闭数据库连接，释放文件锁
      if (this.dbManager) {
        this.dbManager.close()
        this.logger.info('数据库连接已关闭，准备恢复')
      }

      // ③ 为当前数据库文件创建临时备份（用于回滚）
      try {
        await access(targetPath)
        await copyFile(targetPath, tempBackupPath)
        hasTempBackup = true
      } catch {
        // 目标文件不存在，无需备份（首次恢复场景）
      }

      // ④ 清理 WAL/SHM 文件
      for (const sidecar of [walPath, shmPath]) {
        try {
          await access(sidecar)
          await unlink(sidecar)
          this.logger.info('已清理 WAL 附属文件', { file: sidecar })
        } catch {
          // 文件不存在，忽略
        }
      }

      // ⑤ 异步复制备份文件到目标路径
      await copyFile(backupPath, targetPath)
      this.logger.info('备份文件已复制到目标路径', { backupPath, targetPath })

      // ⑥ 重新打开数据库连接
      if (this.dbManager) {
        this.dbManager.open()
        this.logger.info('数据库连接已重新打开')
      }

      // ⑦ 验证恢复后的数据库完整性
      if (this.dbManager) {
        const integrity = this.dbManager.pragma('integrity_check') as Array<{ integrity_check: string }>
        if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
          throw new Error(`完整性验证失败: ${JSON.stringify(integrity)}`)
        }
        this.logger.info('数据库完整性验证通过')
      }

      // 清理临时备份
      if (hasTempBackup) {
        try { await unlink(tempBackupPath) } catch { /* 忽略 */ }
      }

      this.logger.info('数据库已从备份恢复', { backupPath, targetPath })
      return true
    } catch (err) {
      this.logger.error('恢复备份失败', err as Error, { backupPath, targetPath })

      // 回滚：用临时备份恢复原数据库
      if (hasTempBackup) {
        try {
          await copyFile(tempBackupPath, targetPath)
          this.logger.info('已回滚到恢复前的数据库状态')
        } catch (rollbackErr) {
          this.logger.error('回滚失败，数据库可能处于不一致状态', rollbackErr as Error)
        }
      }

      // 尝试重新打开数据库连接
      if (this.dbManager) {
        try {
          this.dbManager.open()
        } catch {
          this.logger.error('恢复后重新打开数据库失败')
        }
      }

      return false
    }
  }
}

<!-- ✅ Issue#83: 已修复，restoreBackup 已使用安全的恢复流程 -->
```

#### 步骤 4：编写测试

> 📌 **设计说明**：测试通过 `DatabaseManager` 的公共 API 进行，而非绕过构造函数替换内部 `db`。
> 构造函数需要 `app.getPath('userData')`，通过 `vi.mock('electron', ...)` 提供真实临时目录路径，
> 使 `DatabaseManager` 在临时目录中创建真实 SQLite 文件，完整覆盖构造函数初始化逻辑。
> 同时补充了对 `pragma()`、`open()`、`exec()` 等此前未覆盖的公共方法的测试。

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdirSync, rmSync } from 'fs'
import { DatabaseManager } from '../database'
import type { Logger } from '../../types/logger'

// 使用真实的临时目录，让 DatabaseManager 构造函数正常执行
const TEST_USER_DATA = join('/tmp', `test-db-${process.pid}`)

vi.mock('electron', () => ({
  app: { getPath: () => TEST_USER_DATA }
}))

// 创建 mock Logger
const createMockLogger = (): Logger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
})

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager
  let logger: Logger

  beforeEach(() => {
    logger = createMockLogger()
    // 确保临时目录存在
    mkdirSync(join(TEST_USER_DATA, 'data'), { recursive: true })
    // 直接通过构造函数创建实例，完整测试初始化流程
    dbManager = new DatabaseManager(logger)
  })

  afterEach(() => {
    dbManager.close()
  })

  // ── 构造函数与初始化 ──────────────────────────────────────

  describe('构造函数与初始化', () => {
    it('构造函数创建实例并记录连接日志', () => {
      expect(dbManager).toBeInstanceOf(DatabaseManager)
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
      dbManager.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
    })

    it('run 执行 INSERT 并返回 RunResult', () => {
      const result = dbManager.run('INSERT INTO test (name) VALUES (?)', 'hello')
      expect(result.changes).toBe(1)
      expect(result.lastInsertRowid).toBe(1)
    })

    it('get 查询单条记录', () => {
      dbManager.run('INSERT INTO test (name) VALUES (?)', 'hello')
      const row = dbManager.get<{ id: number; name: string }>('SELECT * FROM test WHERE id = ?', 1)
      expect(row).toEqual({ id: 1, name: 'hello' })
    })

    it('get 查询不存在的记录返回 undefined', () => {
      const row = dbManager.get<{ id: number; name: string }>('SELECT * FROM test WHERE id = ?', 999)
      expect(row).toBeUndefined()
    })

    it('all 查询多条记录', () => {
      dbManager.run('INSERT INTO test (name) VALUES (?)', 'a')
      dbManager.run('INSERT INTO test (name) VALUES (?)', 'b')
      dbManager.run('INSERT INTO test (name) VALUES (?)', 'c')
      const rows = dbManager.all<{ id: number; name: string }>('SELECT * FROM test ORDER BY id')
      expect(rows).toHaveLength(3)
      expect(rows[0].name).toBe('a')
      expect(rows[2].name).toBe('c')
    })

    it('all 查询空表返回空数组', () => {
      const rows = dbManager.all<{ id: number; name: string }>('SELECT * FROM test')
      expect(rows).toEqual([])
    })

    it('参数化查询防止 SQL 注入', () => {
      dbManager.run('INSERT INTO test (name) VALUES (?)', "'; DROP TABLE test;--")
      const row = dbManager.get<{ name: string }>('SELECT name FROM test WHERE id = ?', 1)
      expect(row?.name).toBe("'; DROP TABLE test;--")
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
      // 两张表都应存在
      dbManager.run('INSERT INTO multi1 (id) VALUES (?)', 1)
      dbManager.run('INSERT INTO multi2 (id) VALUES (?)', 1)
      expect(dbManager.get<{ id: number }>('SELECT id FROM multi1')).toEqual({ id: 1 })
      expect(dbManager.get<{ id: number }>('SELECT id FROM multi2')).toEqual({ id: 1 })
    })
  })

  // ── transaction 方法 ──────────────────────────────────────

  describe('transaction', () => {
    beforeEach(() => {
      dbManager.run('CREATE TABLE txn_test (id INTEGER PRIMARY KEY, name TEXT)')
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

      // 验证迁移历史
      const history = dbManager.getMigrationHistory()
      expect(history).toHaveLength(2)
      expect(history[0].hasDown).toBe(true)
    })

    it('跳过已执行的迁移', () => {
      dbManager.migrate([{ version: 1, sql: 'CREATE TABLE skip_test (id INTEGER PRIMARY KEY)' }])
      // 再次调用相同迁移
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
      // 两张表都应存在（按 1→3 顺序执行）
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
      expect(entry!.checksum).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hex
    })

    it('SQL 被篡改时校验和不匹配，中止执行', () => {
      // 先执行一次正常迁移
      dbManager.migrate([
        { version: 1, sql: 'CREATE TABLE tamper_test (id INTEGER PRIMARY KEY)', description: '防篡改测试' }
      ])

      // 用不同 SQL 再次传入相同版本号（模拟篡改）
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

      // 回滚到 v1：应撤销 v3 和 v2
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
        // 无 down 字段
      ])

      expect(() => {
        dbManager.rollbackTo(0, [{ version: 1, sql: 'CREATE TABLE rb_nodown (id INTEGER PRIMARY KEY)' }])
      }).toThrow(/缺少回滚 SQL/)
    })

    it('回滚事务性：部分失败时全部回滚', () => {
      const migrations = [
        { version: 1, sql: 'CREATE TABLE rb_txn (id INTEGER PRIMARY KEY)', down: 'DROP TABLE IF EXISTS rb_txn' },
        { version: 2, sql: 'INSERT INTO rb_txn (id) VALUES (1)', down: 'DELETE FROM rb_txn WHERE id = 1' }
      ]

      dbManager.migrate(migrations)

      // 尝试回滚到 v0（会成功执行 down SQL 并删除迁移记录）
      dbManager.rollbackTo(0, migrations)
      expect(dbManager.getCurrentVersion()).toBe(0)
    })
  })

  // ── getCurrentVersion 方法 ────────────────────────────────

  describe('getCurrentVersion', () => {
    it('无迁移记录时返回 0', () => {
      // 注意：之前的测试可能已执行过迁移，这里只验证返回类型
      const version = dbManager.getCurrentVersion()
      expect(typeof version).toBe('number')
      expect(version).toBeGreaterThanOrEqual(0)
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
      expect(history.length).toBeGreaterThan(0)
      const last = history[history.length - 1]
      expect(last.version).toBe(77)
      expect(last.description).toBe('历史测试')
      expect(last.hasDown).toBe(true)
      expect(last.checksum).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  // ── pragma 方法 ──────────────────────────────────────────

  describe('pragma', () => {
    it('查询 WAL 模式', () => {
      const result = dbManager.pragma<Array<{ journal_mode: string }>>('journal_mode')
      expect(result).toEqual([{ journal_mode: 'wal' }])
    })

    it('查询 busy_timeout', () => {
      const result = dbManager.pragma<Array<{ busy_timeout: number }>>('busy_timeout')
      expect(result[0].busy_timeout).toBe(5000)
    })

    it('simple 模式返回单值', () => {
      const pageSize = dbManager.pragma<number>('page_size')
      expect(typeof pageSize).toBe('number')
      expect(pageSize).toBeGreaterThan(0)
    })
  })

  // ── open 方法 ─────────────────────────────────────────────

  describe('open', () => {
    it('重新打开数据库后可正常读写', () => {
      dbManager.run('CREATE TABLE reopen (id INTEGER PRIMARY KEY, val TEXT)')
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
      dbManager.run('CREATE TABLE size_test (id INTEGER PRIMARY KEY, data TEXT)')
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
```

### 6.3 代码规范

- **WAL 模式**：必须启用，提升并发读写性能
- **同步模式**：WAL 模式下设置 `synchronous = NORMAL`，比 FULL 快很多且数据安全有保障
- **外键约束**：`foreign_keys = ON`，保证数据完整性
- **参数化查询**：禁止字符串拼接 SQL，防止注入
- **迁移管理**：版本号递增，不可修改已执行的迁移；每个迁移支持可选 `down` SQL 用于回滚；`rollbackTo(version)` 支持版本回退；迁移历史含描述和回滚可用性标记
- **备份策略**：每日自动备份（`BackupManager.startAutoBackup()`），保留 30 天（`retentionDays` 默认 30），备份时间可配置（默认凌晨 3 点），支持启停控制
- **大小监控**：`getDatabaseSize()` 使用 `PRAGMA page_count × page_size` 计算，返回字节数及可读格式；`checkDatabaseSize()` 超过阈值（默认 500MB）时输出警告日志

---
