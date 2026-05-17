/**
 * 数据安全与备份模块 — 类型定义
 */
// ─── 备份相关 ────────────────────────────────────────────

/** 备份触发来源 */
export type BackupTrigger = 'scheduled' | 'manual' | 'config-change' | 'startup' | 'integrity-recovery'

/** 单条备份元数据 */
export interface BackupMetadata {
  /** 备份文件名 */
  filename: string
  /** 完整路径 */
  path: string
  /** 文件大小（字节） */
  size: number
  /** 创建时间 */
  createdAt: Date
  /** 触发来源 */
  trigger: BackupTrigger
  /** SHA-256 校验和 */
  checksum: string
  /** 是否已加密 */
  encrypted: boolean
}

/** 备份调度配置 */
export interface BackupScheduleConfig {
  /** 是否启用定时备份 */
  enabled: boolean
  /** cron 表达式（如 "0 3 * * *" 表示每天凌晨 3 点） */
  cronExpression: string
  /** 备份保留天数 */
  retentionDays: number
  /** 最大备份数量 */
  maxBackups: number
  /** 备份目录（可选，默认使用默认目录） */
  backupDir?: string
  /** 数据库源文件路径 */
  sourcePath: string
}

// ─── 导入导出相关 ─────────────────────────────────────────

/** 导出选项 */
export interface ExportOptions {
  /** 是否加密导出包 */
  encrypt?: boolean
  /** 加密密码（encrypt=true 时必填） */
  password?: string
  /** 是否包含配置文件 */
  includeConfig?: boolean
  /** 自定义导出文件名 */
  filename?: string
}

/** .sda 导出包结构 */
export interface ExportPackage {
  /** 包格式版本 */
  version: number
  /** 导出时间 */
  exportedAt: string
  /** 包内文件清单 */
  files: ExportFileEntry[]
  /** 整包 SHA-256 校验和 */
  checksum: string
  /** 是否已加密 */
  encrypted: boolean
  /** 数据库文件内容 */
  database: Buffer
  /** 配置文件内容（可选） */
  config?: Buffer
}

/** 导出包内单个文件条目 */
export interface ExportFileEntry {
  /** 文件名 */
  name: string
  /** 文件大小（字节） */
  size: number
  /** SHA-256 校验和 */
  checksum: string
}

// ─── 完整性检查相关 ────────────────────────────────────────

/** 完整性错误 */
export interface IntegrityError {
  /** 错误类型 */
  type: 'corruption' | 'wal' | 'size' | 'checksum' | 'unknown'
  /** 错误描述 */
  message: string
  /** 严重程度 */
  severity: 'warning' | 'error' | 'critical'
  /** 相关表名（可选） */
  table?: string
}

/** 完整性修复记录 */
export interface IntegrityRepair {
  /** 修复策略 */
  strategy: 'wal-checkpoint' | 'sqlite-recover' | 'backup-restore'
  /** 是否成功 */
  success: boolean
  /** 修复描述 */
  description: string
  /** 执行时间（毫秒） */
  duration: number
  /** 使用的备份路径（backup-restore 时） */
  backupPath?: string
}

/** 完整性检查结果 */
export interface IntegrityCheckResult {
  /** 是否通过 */
  ok: boolean
  /** 检查时间 */
  checkedAt: Date
  /** 发现的错误列表 */
  errors: IntegrityError[]
  /** 执行的修复操作 */
  repairs: IntegrityRepair[]
  /** 总耗时（毫秒） */
  duration: number
}

// ─── 加密相关 ─────────────────────────────────────────────

/** 加密配置 */
export interface EncryptionConfig {
  /** 密钥派生算法 */
  algorithm: 'aes-256-gcm'
  /** 密钥派生迭代次数 */
  iterations: number
  /** 密钥长度（字节） */
  keyLength: number
  /** IV 长度（字节） */
  ivLength: number
  /** Auth Tag 长度（字节） */
  authTagLength: number
  /** 盐长度（字节） */
  saltLength: number
}

// ─── 事件定义 ─────────────────────────────────────────────

/** 安全模块事件映射 */
export interface SecurityEvents {
  /** 备份开始 */
  'backup:start': { trigger: BackupTrigger }
  /** 备份完成 */
  'backup:complete': { metadata: BackupMetadata }
  /** 备份失败 */
  'backup:error': { error: Error; trigger: BackupTrigger }
  /** 完整性检查开始 */
  'integrity:start': Record<string, never>
  /** 完整性检查完成 */
  'integrity:complete': { result: IntegrityCheckResult }
  /** 完整性修复尝试 */
  'integrity:repair': { repair: IntegrityRepair }
  /** 数据导出开始 */
  'export:start': { filePath: string }
  /** 数据导出完成 */
  'export:complete': { filePath: string; size: number }
  /** 数据导入开始 */
  'import:start': { filePath: string }
  /** 数据导入完成 */
  'import:complete': { filePath: string }
  /** 密钥操作 */
  'encryption:rotated': Record<string, never>
  /** 过期备份清理 */
  'cleanup:complete': { removed: number; remaining: number }
}

/** 安全模块事件名 */
export type SecurityEventName = keyof SecurityEvents

/** 安全模块事件处理器 */
export type SecurityEventHandler<T extends SecurityEventName> = (payload: SecurityEvents[T]) => void

// ─── 工具类型 ─────────────────────────────────────────────

/**
 * Database 实例类型（兼容 better-sqlite3）
 * 由于 better-sqlite3 可能未安装 @types，这里定义兼容接口
 */
export interface SQLiteDatabase {
  pragma(pragma: string): unknown
  exec(sql: string): void
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
  transaction<T>(fn: () => T): () => T
  close(): void
}
