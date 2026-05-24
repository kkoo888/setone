import { stat, readdir } from 'fs/promises'
import { join, extname, basename } from 'path'
import { randomUUID } from 'crypto'
import type { Logger } from '../../../src/main/types/logger'
import type { KBDocument, KBImportResult, KBSettings } from '../types'
import { TextExtractor } from './TextExtractor'
import { ZipExtractor } from './ZipExtractor'
import { VectorStore } from './VectorStore'

/**
 * 知识库管理器
 * 文件导入 → 文本提取 → Vectra（自动切片+嵌入+BM25索引）
 *
 * 联网关闭时：仅存储元数据到 SQLite，跳过 Vectra 索引
 */
export class KBManager {
  private readonly logger: Logger
  private readonly textExtractor: TextExtractor
  private readonly zipExtractor: ZipExtractor
  private readonly vectorStore: VectorStore
  private readonly settings: KBSettings
  private readonly networkEnabled: boolean

  constructor(
    logger: Logger,
    vectorStore: VectorStore,
    settings: KBSettings,
    networkEnabled: boolean
  ) {
    this.logger = logger
    this.vectorStore = vectorStore
    this.settings = settings
    this.networkEnabled = networkEnabled
    this.textExtractor = new TextExtractor(logger)
    this.zipExtractor = new ZipExtractor(logger)
  }

  /** 导入文件或目录 */
  async importPath(path: string): Promise<KBImportResult[]> {
    const fileStat = await stat(path)
    if (fileStat.isDirectory()) {
      const files = await this.collectFiles(path)
      return Promise.all(files.map(f => this.importFile(f)))
    }
    if (this.isArchive(path)) return this.importArchive(path)
    return [await this.importFile(path)]
  }

  /** 导入压缩包 */
  async importArchive(archivePath: string): Promise<KBImportResult[]> {
    const fileName = basename(archivePath)
    const tempDir = join(this.settings.tempDir ?? '/tmp', `kb_import_${Date.now()}`)

    try {
      const extractedFiles = await this.zipExtractor.extract(archivePath, tempDir)
      const supportedExts = TextExtractor.getSupportedFormats()
      const supportedFiles = extractedFiles.filter(f => supportedExts.includes(extname(f).toLowerCase()))

      this.logger.info(`解压完成: ${extractedFiles.length} 文件, ${supportedFiles.length} 可导入`)

      const results: KBImportResult[] = []
      for (const file of supportedFiles) {
        try {
          results.push(await this.importFile(file))
        } catch (err) {
          results.push({ documentId: '', fileName: basename(file), chunkCount: 0, success: false, error: (err as Error).message })
        }
      }

      await this.zipExtractor.cleanup(tempDir)
      return results
    } catch (err) {
      await this.zipExtractor.cleanup(tempDir)
      return [{ documentId: '', fileName, chunkCount: 0, success: false, error: `解压失败: ${(err as Error).message}` }]
    }
  }

  /**
   * 导入单个文件
   * 流程：提取文本 → 存元数据 → Vectra 索引（切片+嵌入+BM25）
   */
  async importFile(filePath: string): Promise<KBImportResult> {
    const fileName = basename(filePath)
    const ext = extname(filePath).toLowerCase()

    if (!this.settings.supportedFormats.includes(ext)) {
      return { documentId: '', fileName, chunkCount: 0, success: false, error: `不支持的文件格式: ${ext}` }
    }

    try {
      // 1. 提取文本
      const content = await this.textExtractor.extract(filePath, ext)
      if (!content?.trim()) {
        return { documentId: '', fileName, chunkCount: 0, success: false, error: '文件内容为空' }
      }

      const documentId = randomUUID()
      const fileSize = Buffer.byteLength(content, 'utf-8')

      // 2. Vectra 索引（自动切片+嵌入+BM25）— 先索引再存元数据，拿到真实 chunkCount
      if (this.networkEnabled) {
        await this.vectorStore.saveToVectra(documentId, content, ext)
        const stats = await this.vectorStore.getStats()
        await this.vectorStore.saveDocument(documentId, fileName, filePath, ext, fileSize, stats.chunks)
        this.logger.info(`文件导入成功: ${fileName}, Vectra 总计 ${stats.chunks} 片段`)
      } else {
        await this.vectorStore.saveDocument(documentId, fileName, filePath, ext, fileSize, 0)
        this.logger.warn(`联网已关闭，文件 "${fileName}" 仅存元数据，未索引`)
      }

      return { documentId, fileName, chunkCount: 0, success: true }
    } catch (err) {
      this.logger.error(`文件导入失败: ${fileName} - ${(err as Error).message}`)
      return { documentId: '', fileName, chunkCount: 0, success: false, error: (err as Error).message }
    }
  }

  private isArchive(path: string): boolean {
    const lower = path.toLowerCase()
    return lower.endsWith('.zip') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz')
  }

  private async collectFiles(dirPath: string): Promise<string[]> {
    const files: string[] = []
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...await this.collectFiles(fullPath))
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (this.settings.supportedFormats.includes(ext) || this.isArchive(entry.name)) {
          files.push(fullPath)
        }
      }
    }
    return files
  }
}
