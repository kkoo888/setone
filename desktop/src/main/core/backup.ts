import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { copyFile, unlink, access } from 'fs/promises'
import type { Logger } from '../types/logger'
import type { DatabaseManager } from './database'

/** 一天的毫秒数 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export class BackupManager {
  private backupDir: string
  private retentionDays: number
  private logger: Logger
  private dbManager?: DatabaseManager
  private autoBackupTimer: ReturnType<typeof setInterval> | null = null
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
    this.stopAutoBackup()

    this.autoBackupSourcePath = sourcePath
    this.autoBackupHour = hour
    this.autoBackupMinute = minute

    const scheduleNext = () => {
      const now = new Date()
      const next = new Date(now)
      next.setHours(hour, minute, 0, 0)
      if (next <= now) {
        next.setDate(next.getDate() + 1)
      }
      return next.getTime() - now.getTime()
    }

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

    const initialTimer = setTimeout(() => {
      runBackup()
      this.autoBackupTimer = setInterval(runBackup, ONE_DAY_MS)
    }, initialDelay)

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

    // WAL checkpoint 确保数据落盘
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
    const cutoff = Date.now() - this.retentionDays * ONE_DAY_MS

    try {
      const files = readdirSync(this.backupDir)
      for (const file of files) {
        if (!file.startsWith('backup-') || !file.endsWith('.db')) continue

        const timestampStr = file.replace('backup-', '').replace('.db', '').replace('.encrypted', '')
        const fileTime = new Date(timestampStr).getTime()

        if (isNaN(fileTime)) {
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
   * 1. WAL checkpoint
   * 2. 关闭连接
   * 3. 创建临时备份（回滚用）
   * 4. 清理 WAL/SHM
   * 5. 复制备份文件
   * 6. 重新打开连接
   * 7. 完整性验证
   */
  async restoreBackup(backupPath: string, targetPath: string): Promise<boolean> {
    const walPath = targetPath + '-wal'
    const shmPath = targetPath + '-shm'
    const tempBackupPath = targetPath + '.pre-restore-backup'
    let hasTempBackup = false

    try {
      // ① WAL checkpoint
      if (this.dbManager) {
        try {
          const result = this.dbManager.pragma('wal_checkpoint(TRUNCATE)') as [number, number, number]
          this.logger.info('WAL checkpoint 完成', { walPages: result })
        } catch (err) {
          this.logger.warn('WAL checkpoint 失败，将继续恢复', { error: (err as Error).message })
        }
      }

      // ② 关闭数据库连接
      if (this.dbManager) {
        this.dbManager.close()
        this.logger.info('数据库连接已关闭，准备恢复')
      }

      // ③ 为当前数据库文件创建临时备份
      try {
        await access(targetPath)
        await copyFile(targetPath, tempBackupPath)
        hasTempBackup = true
      } catch {
        // 目标文件不存在，无需备份
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
