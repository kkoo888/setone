import { access, stat, rename, unlink } from 'fs/promises'

/** 轮转配置 */
export interface RotationConfig {
  /** 单文件最大字节数（默认 10MB） */
  maxSizeBytes: number
  /** 最大保留文件数（默认 5） */
  maxFiles: number
  /** 是否压缩归档（默认 false，未来扩展） */
  compress: boolean
}

const DEFAULT_CONFIG: RotationConfig = {
  maxSizeBytes: 10 * 1024 * 1024,
  maxFiles: 5,
  compress: false
}

/**
 * 日志轮转管理器
 * 独立于 FileTransport，可被其他传输器复用
 */
export class LogRotationManager {
  private config: RotationConfig
  private rotating = false

  constructor(config: Partial<RotationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 检查是否需要轮转（不含执行）
   * @param filePath 当前日志文件路径
   * @returns true 表示文件已超过 maxSizeBytes
   */
  async checkRotation(filePath: string): Promise<boolean> {
    try {
      await access(filePath)
    } catch {
      return false
    }
    const stats = await stat(filePath)
    return stats.size >= this.config.maxSizeBytes
  }

  /**
   * 检查并执行轮转
   * @param filePath 当前日志文件路径
   * @returns 是否执行了轮转
   */
  async rotateIfNeeded(filePath: string): Promise<boolean> {
    if (this.rotating) return false

    const needsRotation = await this.checkRotation(filePath)
    if (!needsRotation) return false

    try {
      this.rotating = true
      await this.rotate(filePath)
      return true
    } catch (err) {
      console.error('[LogRotation] 轮转失败，日志将继续追加到当前文件:', err)
      return false
    } finally {
      this.rotating = false
    }
  }

  /**
   * 执行文件轮转
   * 策略：从最老的文件开始，依次重命名或删除
   * 即使中间某个 .N 文件缺失，也不会阻断后续文件的重命名
   */
  async rotate(filePath: string): Promise<void> {
    // 先删除最老的文件
    const oldestFile = `${filePath}.${this.config.maxFiles}`
    try {
      await access(oldestFile)
      await unlink(oldestFile)
    } catch {
      // 文件不存在，跳过
    }

    // 从次老的开始，依次重命名（序号 +1）
    for (let i = this.config.maxFiles - 1; i >= 1; i--) {
      const from = `${filePath}.${i}`
      const to = `${filePath}.${i + 1}`
      try {
        await access(from)
        await rename(from, to)
      } catch {
        // 文件不存在，跳过
      }
    }

    // 当前文件 → .1
    await rename(filePath, `${filePath}.1`)
  }

  /**
   * 获取所有日志文件列表（当前文件 + 已轮转文件）
   * @param filePath 当前日志文件路径
   * @returns 按序号从新到老排列的文件路径列表
   */
  async getLogFiles(filePath: string): Promise<string[]> {
    const files: string[] = []

    try {
      await access(filePath)
      files.push(filePath)
    } catch {
      // 当前文件不存在
    }

    for (let i = 1; i <= this.config.maxFiles; i++) {
      const rotated = `${filePath}.${i}`
      try {
        await access(rotated)
        files.push(rotated)
      } catch {
        break
      }
    }

    return files
  }

  /**
   * 获取轮转状态信息（用于监控）
   */
  async getRotationInfo(filePath: string): Promise<{
    currentSize: number
    fileCount: number
    needsRotation: boolean
  }> {
    let currentSize = 0
    let fileCount = 0

    try {
      const stats = await stat(filePath)
      currentSize = stats.size
      fileCount = 1
    } catch {
      // 当前文件不存在
    }

    for (let i = 1; i <= this.config.maxFiles; i++) {
      try {
        await access(`${filePath}.${i}`)
        fileCount++
      } catch {
        break
      }
    }

    return {
      currentSize,
      fileCount,
      needsRotation: currentSize >= this.config.maxSizeBytes
    }
  }
}
