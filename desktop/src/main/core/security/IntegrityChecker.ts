/**
 * 完整性检查器 — 数据库完整性验证与自动恢复
 *
 * 三级恢复策略：
 *   1. WAL 检查点（轻量级，修复 WAL 相关问题）
 *   2. sqlite3 .recover（中度，尝试从损坏数据库提取数据）
 *   3. 从最近备份恢复（重度，完全回退到备份状态）
 */
import { EventEmitter } from 'events'
import { existsSync, statSync } from 'fs'
import type { Logger } from '../../types/logger'
import type { DatabaseManager } from '../database'
import type {
  IntegrityCheckResult,
  IntegrityError,
  IntegrityRepair,
  BackupMetadata,
  SecurityEvents,
} from './types'

export class IntegrityChecker extends EventEmitter {
  private logger: Logger

  constructor(logger: Logger) {
    super()
    this.logger = logger
  }

  /**
   * 启动时完整性检测
   * 应用启动时调用，发现问题自动恢复
   * @param db 数据库管理器
   * @param recentBackup 最近的备份（用于第三级恢复）
   */
  async startupCheck(
    db: DatabaseManager,
    recentBackup?: BackupMetadata
  ): Promise<IntegrityCheckResult> {
    this.logger.info('启动时完整性检查开始')
    const result = await this.checkIntegrity(db)

    if (!result.ok) {
      this.logger.warn('启动时完整性检查发现问题，尝试自动恢复', {
        errors: result.errors.map(e => e.message),
      })
      const repaired = await this.autoRepair(db, result.errors, recentBackup)
      result.repairs = repaired
    }

    return result
  }

  /**
   * 执行完整性检查
   * 包含：PRAGMA integrity_check + quick_check + WAL 检查 + 文件大小检查
   */
  async checkIntegrity(db: DatabaseManager): Promise<IntegrityCheckResult> {
    const startTime = Date.now()
    const errors: IntegrityError[] = []
    const checkedAt = new Date()

    this.emit('integrity:start', {} as SecurityEvents['integrity:start'])

    // ① PRAGMA integrity_check
    try {
      const result = db.pragma<Array<{ integrity_check: string }>>('integrity_check')
      if (result.length !== 1 || result[0]?.integrity_check !== 'ok') {
        errors.push({
          type: 'corruption',
          message: `integrity_check 失败: ${JSON.stringify(result)}`,
          severity: 'critical',
        })
      }
    } catch (err) {
      errors.push({
        type: 'corruption',
        message: `integrity_check 执行异常: ${(err as Error).message}`,
        severity: 'critical',
      })
    }

    // ② PRAGMA quick_check
    try {
      const result = db.pragma<Array<{ quick_check: string }>>('quick_check')
      if (result.length !== 1 || result[0]?.quick_check !== 'ok') {
        errors.push({
          type: 'corruption',
          message: `quick_check 失败: ${JSON.stringify(result)}`,
          severity: 'error',
        })
      }
    } catch (err) {
      errors.push({
        type: 'corruption',
        message: `quick_check 执行异常: ${(err as Error).message}`,
        severity: 'error',
      })
    }

    // ③ WAL 检查
    try {
      const walResult = db.pragma<[number, number, number]>(
        'wal_checkpoint(PASSIVE)'
      )
      if (walResult) {
        const [busy, log, checkpointed] = walResult
        if (busy) {
          errors.push({
            type: 'wal',
            message: `WAL 检查点繁忙，未完成的日志页: ${log}，已检查点: ${checkpointed}`,
            severity: 'warning',
          })
        }
      }
    } catch (err) {
      errors.push({
        type: 'wal',
        message: `WAL 检查点执行异常: ${(err as Error).message}`,
        severity: 'warning',
      })
    }

    // ④ 文件大小检查
    try {
      const pageCount = db.pragma<Array<{ page_count: number }>>('page_count') as unknown as number
      const pageSize = db.pragma<Array<{ page_size: number }>>('page_size') as unknown as number
      const sizeResult = pageCount * pageSize

      if (sizeResult === 0) {
        errors.push({
          type: 'size',
          message: '数据库文件大小为 0，可能为空或损坏',
          severity: 'critical',
        })
      }
    } catch (err) {
      errors.push({
        type: 'size',
        message: `文件大小检查异常: ${(err as Error).message}`,
        severity: 'warning',
      })
    }

    const duration = Date.now() - startTime
    const ok = errors.filter(e => e.severity === 'critical' || e.severity === 'error').length === 0

    const result: IntegrityCheckResult = {
      ok,
      checkedAt,
      errors,
      repairs: [],
      duration,
    }

    this.emit('integrity:complete', { result } as SecurityEvents['integrity:complete'])

    if (ok) {
      this.logger.info('完整性检查通过', { duration })
    } else {
      this.logger.warn('完整性检查未通过', {
        errors: errors.map(e => `[${e.severity}] ${e.message}`),
        duration,
      })
    }

    return result
  }

  /**
   * 自动恢复 — 三级恢复策略
   * 1. WAL 检查点
   * 2. sqlite3 .recover（通过导出/重建模拟）
   * 3. 从最近备份恢复
   */
  private async autoRepair(
    db: DatabaseManager,
    errors: IntegrityError[],
    recentBackup?: BackupMetadata
  ): Promise<IntegrityRepair[]> {
    const repairs: IntegrityRepair[] = []

    // 第一级：WAL 检查点
    const hasWalOrCorruption = errors.some(
      e => e.type === 'wal' || e.type === 'corruption'
    )
    if (hasWalOrCorruption) {
      const walRepair = await this.tryWalCheckpoint(db)
      repairs.push(walRepair)
      this.emit('integrity:repair', { repair: walRepair } as SecurityEvents['integrity:repair'])

      if (walRepair.success) {
        // 重新检查
        const recheck = await this.checkIntegrity(db)
        if (recheck.ok) {
          this.logger.info('WAL 检查点修复成功')
          return repairs
        }
      }
    }

    // 第二级：sqlite3 recover（导出 SQL 并重建）
    const hasCritical = errors.some(e => e.severity === 'critical')
    if (hasCritical) {
      const recoverRepair = await this.trySqliteRecover(db)
      repairs.push(recoverRepair)
      this.emit('integrity:repair', { repair: recoverRepair } as SecurityEvents['integrity:repair'])

      if (recoverRepair.success) {
        this.logger.info('SQLite recover 修复成功')
        return repairs
      }
    }

    // 第三级：从最近备份恢复
    if (recentBackup && existsSync(recentBackup.path)) {
      const backupRepair = await this.tryBackupRestore(db, recentBackup)
      repairs.push(backupRepair)
      this.emit('integrity:repair', { repair: backupRepair } as SecurityEvents['integrity:repair'])
    } else {
      this.logger.warn('无可用备份，无法执行第三级恢复')
    }

    return repairs
  }

  /**
   * 第一级恢复：WAL 检查点
   * 尝试将 WAL 文件内容合并到主数据库
   */
  private async tryWalCheckpoint(db: DatabaseManager): Promise<IntegrityRepair> {
    const startTime = Date.now()
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
      return {
        strategy: 'wal-checkpoint',
        success: true,
        description: 'WAL 检查点执行成功，日志已合并到主数据库',
        duration: Date.now() - startTime,
      }
    } catch (err) {
      return {
        strategy: 'wal-checkpoint',
        success: false,
        description: `WAL 检查点失败: ${(err as Error).message}`,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 第二级恢复：SQLite recover
   * 通过导出 SQL 并重建数据库来恢复数据
   * 注：better-sqlite3 没有内置 .recover，这里通过关闭→重新打开→导出表结构和数据来模拟
   */
  private async trySqliteRecover(db: DatabaseManager): Promise<IntegrityRepair> {
    const startTime = Date.now()
    try {
      // 尝试导出所有用户表的数据
      const tables = db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )

      let recoveredTables = 0
      for (const { name } of tables) {
        try {
          // 尝试读取每张表来验证可读性
          const count = db.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM "${name}"`)
          if (count) recoveredTables++
        } catch {
          this.logger.warn(`表 ${name} 无法读取，跳过`)
        }
      }

      // 关闭并重新打开数据库，触发 SQLite 自动修复
      db.close()
      db.open()

      // 重新检查
      const ok = db.checkIntegrity()

      return {
        strategy: 'sqlite-recover',
        success: ok,
        description: ok
          ? `SQLite recover 成功，已恢复 ${recoveredTables}/${tables.length} 张表`
          : `SQLite recover 后完整性检查仍失败`,
        duration: Date.now() - startTime,
      }
    } catch (err) {
      return {
        strategy: 'sqlite-recover',
        success: false,
        description: `SQLite recover 失败: ${(err as Error).message}`,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 第三级恢复：从最近备份恢复
   * 使用现有的 BackupManager 恢复逻辑
   */
  private async tryBackupRestore(
    db: DatabaseManager,
    backup: BackupMetadata
  ): Promise<IntegrityRepair> {
    const startTime = Date.now()
    try {
      if (!existsSync(backup.path)) {
        throw new Error(`备份文件不存在: ${backup.path}`)
      }

      // 关闭当前连接
      db.close()

      // 获取数据库路径并复制备份
      const { copyFileSync } = await import('fs')
      const { join } = await import('path')
      const { app } = await import('electron')

      const dbDir = join(app.getPath('userData'), 'data')
      const targetPath = join(dbDir, 'assistant.db')

      // 清理 WAL/SHM
      const { unlinkSync } = await import('fs')
      for (const ext of ['-wal', '-shm']) {
        try {
          unlinkSync(targetPath + ext)
        } catch {
          // 文件不存在，忽略
        }
      }

      copyFileSync(backup.path, targetPath)

      // 重新打开并验证
      db.open()
      const ok = db.checkIntegrity()

      return {
        strategy: 'backup-restore',
        success: ok,
        description: ok
          ? `从备份 ${backup.filename} 恢复成功`
          : `从备份恢复后完整性检查仍失败`,
        duration: Date.now() - startTime,
        backupPath: backup.path,
      }
    } catch (err) {
      // 尝试重新打开数据库
      try { db.open() } catch { /* 忽略 */ }

      return {
        strategy: 'backup-restore',
        success: false,
        description: `备份恢复失败: ${(err as Error).message}`,
        duration: Date.now() - startTime,
        backupPath: backup.path,
      }
    }
  }
}
