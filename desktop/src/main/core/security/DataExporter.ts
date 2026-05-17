/**
 * 数据导入导出器 — .sda 格式包
 *
 * .sda 包结构（JSON 格式）：
 * {
 *   version: number,
 *   exportedAt: string (ISO),
 *   encrypted: boolean,
 *   checksum: string,
 *   database: string (base64),
 *   config: string | null (base64),
 *   files: [{ name, size, checksum }]
 * }
 *
 * 加密模式下 database/config 字段为加密后的 base64
 */
import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { SECURITY_CONSTANTS } from './constants'
import type { Logger } from '../../types/logger'
import type { EncryptionService } from './EncryptionService'
import type {
  ExportOptions,
  ExportPackage,
  ExportFileEntry,
  SecurityEvents,
} from './types'
import { EventEmitter } from 'events'

export class DataExporter extends EventEmitter {
  private logger: Logger
  private encryptionService: EncryptionService

  constructor(logger: Logger, encryptionService: EncryptionService) {
    super()
    this.logger = logger
    this.encryptionService = encryptionService
  }

  /**
   * 导出数据为 .sda 包
   * @param dbPath 数据库文件路径
   * @param options 导出选项
   * @returns 导出文件路径
   */
  exportData(
    dbPath: string,
    configPath: string | null,
    options: ExportOptions = {}
  ): string {
    const filePath = options.filename ?? this.generateExportPath()
    this.emit('export:start', { filePath } as SecurityEvents['export:start'])

    try {
      // 读取数据库文件
      if (!existsSync(dbPath)) {
        throw new Error(`数据库文件不存在: ${dbPath}`)
      }
      const dbData = readFileSync(dbPath)

      // 读取配置文件（可选）
      let configData: Buffer | null = null
      if (options.includeConfig !== false && configPath && existsSync(configPath)) {
        configData = readFileSync(configPath)
      }

      // 计算校验和
      const dbChecksum = this.encryptionService.computeChecksum(dbData)
      const files: ExportFileEntry[] = [
        {
          name: SECURITY_CONSTANTS.EXPORT_DB_FILENAME,
          size: dbData.length,
          checksum: dbChecksum,
        },
      ]

      if (configData) {
        const configChecksum = this.encryptionService.computeChecksum(configData)
        files.push({
          name: SECURITY_CONSTANTS.EXPORT_CONFIG_FILENAME,
          size: configData.length,
          checksum: configChecksum,
        })
      }

      // 加密（可选）
      let finalDbData: Buffer = dbData
      let finalConfigData: Buffer | null = configData
      let encrypted = false

      if (options.encrypt) {
        if (!options.password) {
          throw new Error('加密导出需要提供密码')
        }
        if (!this.encryptionService.isInitialized()) {
          this.encryptionService.initialize(options.password)
        }
        finalDbData = this.encryptionService.encrypt(dbData)
        if (configData) {
          finalConfigData = this.encryptionService.encrypt(configData)
        }
        encrypted = true
      }

      // 构建导出包
      const pkg: ExportPackage = {
        version: SECURITY_CONSTANTS.EXPORT_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        files,
        checksum: '',
        encrypted,
        database: finalDbData,
        config: finalConfigData ?? undefined,
      }

      // 计算整包校验和（不含 checksum 字段本身）
      const pkgForChecksum = { ...pkg, checksum: '' }
      const pkgJson = JSON.stringify(pkgForChecksum)
      pkg.checksum = this.encryptionService.computeChecksum(pkgJson)

      // 序列化并写入
      const output = JSON.stringify(pkg)
      writeFileSync(filePath, output, 'utf8')

      const stats = { filePath, size: Buffer.byteLength(output) }
      this.emit('export:complete', stats as SecurityEvents['export:complete'])
      this.logger.info('数据导出完成', {
        filePath,
        size: stats.size,
        encrypted,
        fileCount: files.length,
      })

      return filePath
    } catch (err) {
      this.logger.error('数据导出失败', err as Error, { filePath })
      throw err
    }
  }

  /**
   * 导入 .sda 包
   * @param filePath .sda 文件路径
   * @param password 解密密码（加密包时必填）
   * @returns { database, config, metadata }
   */
  importData(
    filePath: string,
    password?: string
  ): { database: Buffer; config: Buffer | null; metadata: ExportPackage } {
    this.emit('import:start', { filePath } as SecurityEvents['import:start'])

    try {
      if (!existsSync(filePath)) {
        throw new Error(`导入文件不存在: ${filePath}`)
      }

      const raw = readFileSync(filePath, 'utf8')
      const pkg: ExportPackage = JSON.parse(raw)

      // 验证格式版本
      if (!pkg.version || pkg.version > SECURITY_CONSTANTS.EXPORT_FORMAT_VERSION) {
        throw new Error(`不支持的导出包版本: ${pkg.version}`)
      }

      // 验证校验和
      const savedChecksum = pkg.checksum
      const pkgForChecksum = { ...pkg, checksum: '' }
      const computedChecksum = this.encryptionService.computeChecksum(
        JSON.stringify(pkgForChecksum)
      )
      if (savedChecksum !== computedChecksum) {
        throw new Error(
          `导出包校验和不匹配，文件可能已损坏或被篡改。` +
          `预期: ${computedChecksum}，实际: ${savedChecksum}`
        )
      }

      // 解密（如需要）
      let dbData = pkg.database
      let configData: Buffer | null = pkg.config ?? null

      if (pkg.encrypted) {
        if (!password) {
          throw new Error('此导出包已加密，请提供密码')
        }
        if (!this.encryptionService.isInitialized()) {
          this.encryptionService.initialize(password)
        }

        // base64 解码 → 解密
        dbData = this.encryptionService.decrypt(
          Buffer.from(pkg.database as unknown as string, 'base64')
        ) as unknown as typeof pkg.database

        if (configData) {
          configData = this.encryptionService.decrypt(
            Buffer.from(configData as unknown as string, 'base64')
          ) as unknown as typeof configData
        }
      }

      // 验证文件校验和
      const dbBuf = Buffer.from(dbData as unknown as string, pkg.encrypted ? 'utf8' : 'base64')
      const dbChecksum = this.encryptionService.computeChecksum(dbBuf)
      const dbEntry = pkg.files.find(f => f.name === SECURITY_CONSTANTS.EXPORT_DB_FILENAME)
      if (dbEntry && dbEntry.checksum !== dbChecksum) {
        throw new Error(`数据库文件校验和不匹配`)
      }

      this.emit('import:complete', { filePath } as SecurityEvents['import:complete'])
      this.logger.info('数据导入完成', {
        filePath,
        encrypted: pkg.encrypted,
        fileCount: pkg.files.length,
      })

      return {
        database: dbBuf,
        config: configData ? Buffer.from(configData as unknown as string, 'base64') : null,
        metadata: pkg,
      }
    } catch (err) {
      this.logger.error('数据导入失败', err as Error, { filePath })
      throw err
    }
  }

  /** 生成默认导出文件路径 */
  private generateExportPath(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return join(
      SECURITY_CONSTANTS.DEFAULT_BACKUP_DIR,
      `export-${timestamp}${SECURITY_CONSTANTS.EXPORT_PACKAGE_EXT}`
    )
  }
}
