/**
 * 数据安全与备份模块 — 统一导出
 */
export { SecurityManager } from './SecurityManager'
export { EncryptionService } from './EncryptionService'
export { IntegrityChecker } from './IntegrityChecker'
export { BackupScheduler } from './BackupScheduler'
export { DataExporter } from './DataExporter'
export { SECURITY_CONSTANTS } from './constants'

export type {
  BackupMetadata,
  BackupTrigger,
  BackupScheduleConfig,
  ExportPackage,
  ExportOptions,
  ExportFileEntry,
  IntegrityCheckResult,
  IntegrityError,
  IntegrityRepair,
  EncryptionConfig,
  SecurityEvents,
  SecurityEventName,
  SecurityEventHandler,
  SQLiteDatabase,
} from './types'
