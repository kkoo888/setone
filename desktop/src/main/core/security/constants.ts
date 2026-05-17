/**
 * 数据安全与备份模块 — 常量定义
 */
import { app } from 'electron'
import { join } from 'path'
import type { EncryptionConfig } from './types'

/** 安全模块常量 */
export const SECURITY_CONSTANTS = {
  /** 默认备份目录 */
  get DEFAULT_BACKUP_DIR(): string {
    return join(app.getPath('userData'), 'backups')
  },

  /** 默认 cron 表达式：每天凌晨 3:00 */
  DEFAULT_CRON: '0 3 * * *',

  /** 默认备份保留天数 */
  DEFAULT_RETENTION_DAYS: 30,

  /** 最大备份数量 */
  DEFAULT_MAX_BACKUPS: 50,

  /** 备份文件前缀 */
  BACKUP_FILE_PREFIX: 'backup-',

  /** 备份文件扩展名 */
  BACKUP_FILE_EXT: '.db',

  /** 加密备份扩展名 */
  ENCRYPTED_BACKUP_EXT: '.db.enc',

  /** 导出包扩展名 */
  EXPORT_PACKAGE_EXT: '.sda',

  /** 导出包格式版本 */
  EXPORT_FORMAT_VERSION: 1,

  /** 导出包内数据库文件名 */
  EXPORT_DB_FILENAME: 'database.db',

  /** 导出包内配置文件名 */
  EXPORT_CONFIG_FILENAME: 'config.json',

  /** 导出包内清单文件名 */
  EXPORT_MANIFEST_FILENAME: 'manifest.json',

  /** 默认加密配置 */
  ENCRYPTION: {
    algorithm: 'aes-256-gcm',
    iterations: 100_000,
    keyLength: 32,
    ivLength: 16,
    authTagLength: 16,
    saltLength: 32,
  } satisfies EncryptionConfig,

  /** 数据库大小警告阈值（500MB） */
  DB_SIZE_WARNING_THRESHOLD: 500 * 1024 * 1024,

  /** 最小备份间隔（毫秒），防止频繁备份 */
  MIN_BACKUP_INTERVAL_MS: 60 * 1000,

  /** 文件锁超时（毫秒） */
  LOCK_TIMEOUT_MS: 5 * 60 * 1000,

  /** 完整性检查超时（毫秒） */
  INTEGRITY_CHECK_TIMEOUT_MS: 30 * 1000,
} as const
