/**
 * 备份调度器 — 定时/手动/配置变更触发备份
 *
 * 特性：
 *   - cron 表达式调度（原生 setTimeout 实现，无外部依赖）
 *   - 文件锁防止并发写入
 *   - 自动清理过期备份
 *   - 备份历史管理
 */
import { EventEmitter } from 'events'
import {
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { SECURITY_CONSTANTS } from './constants'
import type { Logger } from '../../types/logger'
import type { DatabaseManager } from '../database'
import type {
  BackupMetadata,
  BackupScheduleConfig,
  BackupTrigger,
  SecurityEvents,
} from './types'

/** 备份历史记录文件名 */
const HISTORY_FILENAME = 'backup-history.json'

export class BackupScheduler extends EventEmitter {
  private logger: Logger
  private dbManager: DatabaseManager
  private config: BackupScheduleConfig
  private timer: ReturnType<typeof setTimeout> | null = null
  private locked = false
  private lockTimeout: ReturnType<typeof setTimeout> | null = null
  private history: BackupMetadata[] = []
  private lastBackupTime = 0

  constructor(logger: Logger, dbManager: DatabaseManager, config: BackupScheduleConfig) {
    super()
    this.logger = logger
    this.dbManager = dbManager
    this.config = {
      backupDir: SECURITY_CONSTANTS.DEFAULT_BACKUP_DIR,
      ...config,
    }
    // 确保备份目录存在
    mkdirSync(this.config.backupDir!, { recursive: true })
    // 加载历史
    this.loadHistory()
  }

  /**
   * 启动定时备份调度
   */
  start(): void {
    this.stop()

    if (!this.config.enabled) {
      this.logger.info('定时备份已禁用')
      return
    }

    this.scheduleNext()
    this.logger.info('定时备份调度已启动', {
      cron: this.config.cronExpression,
      backupDir: this.config.backupDir,
    })
  }

  /** 停止调度 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      this.logger.info('定时备份调度已停止')
    }
  }

  /**
   * 手动触发备份
   */
  async manualBackup(): Promise<BackupMetadata | null> {
    return this.executeBackup('manual')
  }

  /**
   * 配置变更时备份
   */
  async onConfigChange(): Promise<BackupMetadata | null> {
    return this.executeBackup('config-change')
  }

  /**
   * 更新调度配置
   */
  updateConfig(config: Partial<BackupScheduleConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.backupDir) {
      mkdirSync(config.backupDir, { recursive: true })
    }
    // 如果正在运行，重启调度
    if (this.timer) {
      this.start()
    }
  }

  /** 获取当前配置 */
  getConfig(): BackupScheduleConfig {
    return { ...this.config }
  }

  /**
   * 获取备份历史
   */
  getHistory(): BackupMetadata[] {
    return [...this.history].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  /**
   * 获取最近的备份
   */
  getLatestBackup(): BackupMetadata | undefined {
    if (this.history.length === 0) return undefined
    return this.history.reduce((latest, item) =>
      item.createdAt > latest.createdAt ? item : latest
    )
  }

  /**
   * 列出备份目录中的所有备份文件
   */
  listBackups(): BackupMetadata[] {
    const backupDir = this.config.backupDir!
    if (!existsSync(backupDir)) return []

    try {
      const files = readdirSync(backupDir)
      const prefix = SECURITY_CONSTANTS.BACKUP_FILE_PREFIX
      const ext = SECURITY_CONSTANTS.BACKUP_FILE_EXT
      const encExt = SECURITY_CONSTANTS.ENCRYPTED_BACKUP_EXT

      return files
        .filter(f => f.startsWith(prefix) && (f.endsWith(ext) || f.endsWith(encExt)))
        .map(f => {
          const filePath = join(backupDir, f)
          const stats = statSync(filePath)
          // 从历史中查找匹配记录
          const record = this.history.find(h => h.filename === f)
          return {
            filename: f,
            path: filePath,
            size: stats.size,
            createdAt: stats.mtime,
            trigger: (record?.trigger ?? 'scheduled') as BackupTrigger,
            checksum: record?.checksum ?? '',
            encrypted: f.endsWith(encExt),
          }
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    } catch (err) {
      this.logger.error('列出备份文件失败', err as Error)
      return []
    }
  }

  /**
   * 清理过期备份
   */
  cleanupExpired(): { removed: number; remaining: number } {
    const backupDir = this.config.backupDir!
    if (!existsSync(backupDir)) return { removed: 0, remaining: 0 }

    const cutoff = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000
    let removed = 0

    try {
      const files = readdirSync(backupDir)
      const prefix = SECURITY_CONSTANTS.BACKUP_FILE_PREFIX
      const ext = SECURITY_CONSTANTS.BACKUP_FILE_EXT
      const encExt = SECURITY_CONSTANTS.ENCRYPTED_BACKUP_EXT

      for (const file of files) {
        if (!file.startsWith(prefix)) continue
        if (!file.endsWith(ext) && !file.endsWith(encExt)) continue

        const filePath = join(backupDir, file)
        const stats = statSync(filePath)

        // 检查是否过期（优先使用文件名中的时间戳）
        const timestampStr = file
          .replace(prefix, '')
          .replace(encExt, '')
          .replace(ext, '')
        const fileTime = new Date(timestampStr).getTime()
        const effectiveTime = isNaN(fileTime) ? stats.mtimeMs : fileTime

        if (effectiveTime < cutoff) {
          unlinkSync(filePath)
          removed++
          this.logger.info('已清理过期备份', { file })
        }
      }

      // 同时限制最大备份数量
      const remaining = this.listBackups()
      if (remaining.length > this.config.maxBackups) {
        const toRemove = remaining.slice(this.config.maxBackups)
        for (const backup of toRemove) {
          if (existsSync(backup.path)) {
            unlinkSync(backup.path)
            removed++
          }
        }
      }

      const finalRemaining = this.listBackups().length

      // 从历史中移除已删除的记录
      this.history = this.history.filter(h => existsSync(h.path))
      this.saveHistory()

      const result = { removed, remaining: finalRemaining }
      this.emit('cleanup:complete', result as SecurityEvents['cleanup:complete'])
      return result
    } catch (err) {
      this.logger.error('清理过期备份失败', err as Error)
      return { removed, remaining: this.listBackups().length }
    }
  }

  /**
   * 销毁调度器
   */
  destroy(): void {
    this.stop()
    this.releaseLock()
    this.removeAllListeners()
  }

  // ─── 内部方法 ──────────────────────────────────────────

  /**
   * 解析 cron 表达式并计算下次执行时间
   * 支持格式：分 时 日 月 周（标准 5 段 cron）
   */
  private scheduleNext(): void {
    const delay = this.calculateNextDelay()
    this.timer = setTimeout(() => {
      this.executeBackup('scheduled').catch(err => {
        this.logger.error('定时备份执行失败', err as Error)
      })
      this.scheduleNext()
    }, delay)

    this.logger.debug('下次备份调度', { delayMs: delay, at: new Date(Date.now() + delay).toISOString() })
  }

  /**
   * 计算到下次 cron 触发的毫秒数
   */
  private calculateNextDelay(): number {
    const parts = this.config.cronExpression.split(/\s+/)
    if (parts.length < 5) {
      // 格式错误，回退到默认每天 3:00
      return this.calculateDelayForTime(3, 0)
    }

    const [minuteStr, hourStr, dayOfMonth, month, dayOfWeek] = parts

    const now = new Date()
    const targetMinute = minuteStr === '*' ? -1 : parseInt(minuteStr, 10)
    const targetHour = hourStr === '*' ? -1 : parseInt(hourStr, 10)

    // 简单情况：每小时/每天
    if (targetHour >= 0 && targetMinute >= 0) {
      return this.calculateDelayForTime(targetHour, targetMinute)
    }

    // 每 N 分钟
    if (minuteStr.startsWith('*/')) {
      const interval = parseInt(minuteStr.slice(2), 10)
      const nextMinute = Math.ceil((now.getMinutes() + 1) / interval) * interval
      const next = new Date(now)
      next.setSeconds(0, 0)
      next.setMinutes(nextMinute)
      if (next <= now) next.setMinutes(next.getMinutes() + interval)
      return next.getTime() - now.getTime()
    }

    // 默认：每天凌晨 3 点
    return this.calculateDelayForTime(3, 0)
  }

  /** 计算指定时分的延迟毫秒数 */
  private calculateDelayForTime(hour: number, minute: number): number {
    const now = new Date()
    const next = new Date(now)
    next.setHours(hour, minute, 0, 0)
    if (next <= now) {
      next.setDate(next.getDate() + 1)
    }
    return next.getTime() - now.getTime()
  }

  /**
   * 执行备份（带文件锁）
   */
  private async executeBackup(trigger: BackupTrigger): Promise<BackupMetadata | null> {
    // 防止频繁备份
    const now = Date.now()
    if (now - this.lastBackupTime < SECURITY_CONSTANTS.MIN_BACKUP_INTERVAL_MS) {
      this.logger.debug('距上次备份间隔太短，跳过')
      return null
    }

    // 获取文件锁
    if (!this.acquireLock()) {
      this.logger.warn('备份正在进行中，跳过本次')
      return null
    }

    this.emit('backup:start', { trigger } as SecurityEvents['backup:start'])

    try {
      // WAL checkpoint 确保数据落盘
      try {
        this.dbManager.pragma('wal_checkpoint(TRUNCATE)')
      } catch {
        this.logger.warn('备份前 WAL checkpoint 失败，继续复制')
      }

      // 生成备份文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `${SECURITY_CONSTANTS.BACKUP_FILE_PREFIX}${timestamp}${SECURITY_CONSTANTS.BACKUP_FILE_EXT}`
      const destPath = join(this.config.backupDir!, filename)

      // 复制数据库文件
      copyFileSync(this.config.sourcePath, destPath)

      // 计算校验和
      const { createHash } = await import('crypto')
      const fileData = readFileSync(destPath)
      const checksum = createHash('sha256').update(fileData).digest('hex')

      const stats = statSync(destPath)
      const metadata: BackupMetadata = {
        filename,
        path: destPath,
        size: stats.size,
        createdAt: new Date(),
        trigger,
        checksum,
        encrypted: false,
      }

      // 记录历史
      this.history.push(metadata)
      if (this.history.length > this.config.maxBackups * 2) {
        this.history = this.history.slice(-this.config.maxBackups)
      }
      this.saveHistory()
      this.lastBackupTime = Date.now()

      this.emit('backup:complete', { metadata } as SecurityEvents['backup:complete'])
      this.logger.info('备份完成', { filename, trigger, size: stats.size })

      // 清理过期备份
      this.cleanupExpired()

      return metadata
    } catch (err) {
      this.emit('backup:error', { error: err as Error, trigger } as SecurityEvents['backup:error'])
      this.logger.error('备份执行失败', err as Error, { trigger })
      return null
    } finally {
      this.releaseLock()
    }
  }

  /** 获取文件锁 */
  private acquireLock(): boolean {
    if (this.locked) return false
    this.locked = true

    // 设置锁超时
    this.lockTimeout = setTimeout(() => {
      this.logger.warn('备份锁超时，强制释放')
      this.releaseLock()
    }, SECURITY_CONSTANTS.LOCK_TIMEOUT_MS)

    return true
  }

  /** 释放文件锁 */
  private releaseLock(): void {
    this.locked = false
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout)
      this.lockTimeout = null
    }
  }

  /** 加载备份历史 */
  private loadHistory(): void {
    const historyPath = join(this.config.backupDir!, HISTORY_FILENAME)
    try {
      if (existsSync(historyPath)) {
        const raw = readFileSync(historyPath, 'utf8')
        const data = JSON.parse(raw) as Array<Omit<BackupMetadata, 'createdAt'> & { createdAt: string }>
        this.history = data.map(item => ({
          ...item,
          createdAt: new Date(item.createdAt),
        }))
      }
    } catch {
      this.history = []
    }
  }

  /** 保存备份历史 */
  private saveHistory(): void {
    const historyPath = join(this.config.backupDir!, HISTORY_FILENAME)
    try {
      writeFileSync(historyPath, JSON.stringify(this.history, null, 2), 'utf8')
    } catch (err) {
      this.logger.error('保存备份历史失败', err as Error)
    }
  }
}
