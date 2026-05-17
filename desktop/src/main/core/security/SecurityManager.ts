/**
 * 安全管理器 — 统一入口
 *
 * 整合 EncryptionService, IntegrityChecker, BackupScheduler, DataExporter
 * 对外暴露简洁 API
 */
import { EventEmitter } from 'events'
import type { Logger } from '../../types/logger'
import type { DatabaseManager } from '../database'
import { EncryptionService } from './EncryptionService'
import { IntegrityChecker } from './IntegrityChecker'
import { BackupScheduler } from './BackupScheduler'
import { DataExporter } from './DataExporter'
import type {
  BackupScheduleConfig,
  BackupMetadata,
  IntegrityCheckResult,
  ExportOptions,
  ExportPackage,
  SecurityEvents,
} from './types'

export class SecurityManager extends EventEmitter {
  readonly encryption: EncryptionService
  readonly integrity: IntegrityChecker
  readonly backup: BackupScheduler
  readonly exporter: DataExporter

  private logger: Logger
  private dbManager: DatabaseManager
  private configPath: string | null = null

  constructor(
    logger: Logger,
    dbManager: DatabaseManager,
    backupConfig: BackupScheduleConfig,
    configPath?: string
  ) {
    super()
    this.logger = logger
    this.dbManager = dbManager
    this.configPath = configPath ?? null

    // 初始化各子模块
    this.encryption = new EncryptionService()
    this.integrity = new IntegrityChecker(logger)
    this.backup = new BackupScheduler(logger, dbManager, backupConfig)
    this.exporter = new DataExporter(logger, this.encryption)

    // 转发子模块事件
    this.forwardEvents()
  }

  /**
   * 初始化安全管理器
   * @param password 加密密码（可选，不传则不启用加密）
   * @param salt 加密盐（可选）
   */
  initialize(password?: string, salt?: Buffer): void {
    if (password) {
      this.encryption.initialize(password, salt)
      this.logger.info('安全管理器已初始化（加密已启用）')
    } else {
      this.logger.info('安全管理器已初始化（加密未启用）')
    }
  }

  /**
   * 启动完整性检查 + 定时备份
   * @param checkIntegrity 是否执行启动完整性检查
   */
  async startup(checkIntegrity = true): Promise<IntegrityCheckResult | null> {
    let result: IntegrityCheckResult | null = null

    // 启动完整性检查
    if (checkIntegrity) {
      const latestBackup = this.backup.getLatestBackup()
      result = await this.integrity.startupCheck(this.dbManager, latestBackup)
    }

    // 启动定时备份
    this.backup.start()

    return result
  }

  /**
   * 手动触发备份
   */
  async manualBackup(): Promise<BackupMetadata | null> {
    return this.backup.manualBackup()
  }

  /**
   * 配置变更时触发备份
   */
  async onConfigChange(): Promise<BackupMetadata | null> {
    return this.backup.onConfigChange()
  }

  /**
   * 执行完整性检查
   */
  async checkIntegrity(): Promise<IntegrityCheckResult> {
    return this.integrity.checkIntegrity(this.dbManager)
  }

  /**
   * 导出数据
   */
  exportData(options: ExportOptions = {}): string {
    const dbPath = this.getDbPath()
    return this.exporter.exportData(dbPath, this.configPath, options)
  }

  /**
   * 导入数据
   */
  importData(filePath: string, password?: string): {
    database: Buffer
    config: Buffer | null
    metadata: ExportPackage
  } {
    return this.exporter.importData(filePath, password)
  }

  /**
   * 密钥轮换
   */
  rotateKey(oldPassword: string, newPassword: string, encryptedData: Buffer): {
    data: Buffer
    salt: Buffer
  } {
    return this.encryption.rotateKey(oldPassword, newPassword, encryptedData)
  }

  /**
   * 计算校验和
   */
  computeChecksum(data: string | Buffer): string {
    return this.encryption.computeChecksum(data)
  }

  /**
   * 获取备份历史
   */
  getBackupHistory(): BackupMetadata[] {
    return this.backup.getHistory()
  }

  /**
   * 获取最近备份
   */
  getLatestBackup(): BackupMetadata | undefined {
    return this.backup.getLatestBackup()
  }

  /**
   * 更新备份配置
   */
  updateBackupConfig(config: Partial<BackupScheduleConfig>): void {
    this.backup.updateConfig(config)
  }

  /**
   * 清理过期备份
   */
  cleanupBackups(): { removed: number; remaining: number } {
    return this.backup.cleanupExpired()
  }

  /**
   * 停止所有服务
   */
  stop(): void {
    this.backup.stop()
  }

  /**
   * 销毁安全管理器
   * 安全清除所有密钥材料
   */
  destroy(): void {
    this.backup.destroy()
    this.encryption.destroy()
    this.removeAllListeners()
    this.logger.info('安全管理器已销毁')
  }

  // ─── 内部方法 ──────────────────────────────────────────

  /** 获取数据库文件路径 */
  private getDbPath(): string {
    const config = this.backup.getConfig()
    return config.sourcePath
  }

  /** 转发子模块事件到安全管理器 */
  private forwardEvents(): void {
    const events: Array<keyof SecurityEvents> = [
      'backup:start',
      'backup:complete',
      'backup:error',
      'integrity:start',
      'integrity:complete',
      'integrity:repair',
      'export:start',
      'export:complete',
      'import:start',
      'import:complete',
      'encryption:rotated',
      'cleanup:complete',
    ]

    for (const event of events) {
      this.encryption.on(event, (payload) => this.emit(event, payload))
      this.integrity.on(event, (payload) => this.emit(event, payload))
      this.backup.on(event, (payload) => this.emit(event, payload))
      this.exporter.on(event, (payload) => this.emit(event, payload))
    }
  }
}
