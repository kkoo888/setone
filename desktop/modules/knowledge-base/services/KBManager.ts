import { stat, readdir } from 'fs/promises'
import { join, extname, basename } from 'path'
import { randomUUID } from 'crypto'
import type { Logger } from '../../../src/main/types/logger'
import type { KBDocument, KBChunk, KBImportResult, KBSettings } from '../types'
import { SmartChunker as Chunker } from './SmartChunker'
import { TextExtractor } from './TextExtractor'
import { ZipExtractor } from './ZipExtractor'
import { EmbeddingService } from './EmbeddingService'
import { VectorStore } from './VectorStore'

/**
 * 知识库管理器
 * 负责文件导入、文本提取、切片、向量化和存储
 * 支持联网开关：关闭时仅导入文本，跳过向量化
 *
 * v2: 新增格式支持（jsonl, yaml, html, xml, parquet）
 *     新增 ZIP 自动解压导入
 *     新增智能切片策略（按记录/行/段落/固定）
 */
export class KBManager {
  private readonly logger: Logger
  private readonly chunker: Chunker
  private readonly textExtractor: TextExtractor
  private readonly zipExtractor: ZipExtractor
  private readonly embeddingService: EmbeddingService
  private readonly vectorStore: VectorStore
  private readonly settings: KBSettings

  constructor(
    logger: Logger,
    embeddingService: EmbeddingService,
    vectorStore: VectorStore,
    settings: KBSettings
  ) {
    this.logger = logger
    this.embeddingService = embeddingService
    this.vectorStore = vectorStore
    this.settings = settings
    this.chunker = new Chunker(settings.chunkSize, settings.chunkOverlap, logger)
    this.textExtractor = new TextExtractor(logger)
    this.zipExtractor = new ZipExtractor(logger)
  }

  /**
   * 导入文件或目录到知识库
   * 自动识别 .zip/.tar.gz 并解压后遍历导入
   */
  async importPath(path: string): Promise<KBImportResult[]> {
    const fileStat = await stat(path)
    const results: KBImportResult[] = []

    if (fileStat.isDirectory()) {
      const files = await this.collectFiles(path)
      for (const file of files) {
        const result = await this.importFile(file)
        results.push(result)
      }
    } else {
      // 检查是否是压缩包
      if (this.isArchive(path)) {
        const archiveResults = await this.importArchive(path)
        results.push(...archiveResults)
      } else {
        const result = await this.importFile(path)
        results.push(result)
      }
    }

    return results
  }

  /**
   * 导入压缩包（自动解压后遍历导入支持的文件）
   */
  async importArchive(archivePath: string): Promise<KBImportResult[]> {
    const fileName = basename(archivePath)
    const tempDir = join(this.settings.tempDir ?? '/tmp', `kb_import_${Date.now()}`)

    this.logger.info(`解压压缩包: ${fileName}`)

    try {
      // 解压
      const extractedFiles = await this.zipExtractor.extract(archivePath, tempDir)
      this.logger.info(`解压完成，共 ${extractedFiles.length} 个文件`)

      // 过滤支持的格式
      const supportedExts = TextExtractor.getSupportedFormats()
      const supportedFiles = extractedFiles.filter(f => {
        const ext = extname(f).toLowerCase()
        return supportedExts.includes(ext)
      })

      this.logger.info(`其中 ${supportedFiles.length} 个文件支持导入`)

      // 逐个导入
      const results: KBImportResult[] = []
      for (const file of supportedFiles) {
        try {
          const result = await this.importFile(file)
          results.push(result)
        } catch (err) {
          this.logger.warn(`导入文件失败: ${file} - ${(err as Error).message}`)
          results.push({
            documentId: '',
            fileName: basename(file),
            chunkCount: 0,
            success: false,
            error: (err as Error).message
          })
        }
      }

      // 清理临时目录
      await this.zipExtractor.cleanup(tempDir)

      return results
    } catch (err) {
      this.logger.error(`压缩包导入失败: ${fileName} - ${(err as Error).message}`)
      // 清理可能残留的临时目录
      await this.zipExtractor.cleanup(tempDir)

      return [{
        documentId: '',
        fileName,
        chunkCount: 0,
        success: false,
        error: `解压失败: ${(err as Error).message}`
      }]
    }
  }

  /**
   * 导入单个文件
   */
  async importFile(filePath: string): Promise<KBImportResult> {
    const fileName = basename(filePath)
    const ext = extname(filePath).toLowerCase()

    // 检查格式支持
    if (!this.settings.supportedFormats.includes(ext)) {
      return {
        documentId: '',
        fileName,
        chunkCount: 0,
        success: false,
        error: `不支持的文件格式: ${ext}`
      }
    }

    try {
      // 使用 TextExtractor 提取文本
      const content = await this.textExtractor.extract(filePath, ext)
      if (!content || content.trim().length === 0) {
        return {
          documentId: '',
          fileName,
          chunkCount: 0,
          success: false,
          error: '文件内容为空或无法提取文本'
        }
      }

      // 智能切片（传入格式提示）
      const textChunks = this.chunker.chunk(content, ext)
      if (textChunks.length === 0) {
        return {
          documentId: '',
          fileName,
          chunkCount: 0,
          success: false,
          error: '文本切片失败'
        }
      }

      // 生成文档 ID
      const documentId = randomUUID()
      const fileSize = Buffer.byteLength(content, 'utf-8')

      // 根据联网状态决定是否生成向量
      const isNetworkOn = this.embeddingService.isNetworkEnabled()
      let embeddings: number[][] = []

      if (isNetworkOn) {
        embeddings = await this.embeddingService.embedBatch(textChunks)
      } else {
        this.logger.warn(`联网已关闭，文件 "${fileName}" 仅导入文本，未生成向量`)
        embeddings = textChunks.map(() => [])
      }

      // 构建片段对象
      const chunks: KBChunk[] = textChunks.map((text, index) => ({
        id: `${documentId}_chunk_${index}`,
        documentId,
        chunkIndex: index,
        content: text,
        embedding: embeddings[index],
        createdAt: Date.now()
      }))

      // 存储文档和片段
      await this.vectorStore.saveDocument(documentId, fileName, filePath, ext, fileSize, chunks.length)
      await this.vectorStore.saveChunks(chunks)

      this.logger.info(`文件导入成功: ${fileName}, ${chunks.length} 个片段`)

      return {
        documentId,
        fileName,
        chunkCount: chunks.length,
        success: true
      }
    } catch (err) {
      const errorMsg = (err as Error).message
      this.logger.error(`文件导入失败: ${fileName} - ${errorMsg}`)
      return {
        documentId: '',
        fileName,
        chunkCount: 0,
        success: false,
        error: errorMsg
      }
    }
  }

  /**
   * 判断是否是压缩包
   */
  private isArchive(path: string): boolean {
    const lower = path.toLowerCase()
    return lower.endsWith('.zip') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz')
  }

  /**
   * 递归收集目录下的所有支持格式文件
   */
  private async collectFiles(dirPath: string): Promise<string[]> {
    const files: string[] = []
    const entries = await readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        // 跳过隐藏目录和 node_modules
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subFiles = await this.collectFiles(fullPath)
          files.push(...subFiles)
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        // 支持的格式 + 压缩包
        if (this.settings.supportedFormats.includes(ext) || this.isArchive(entry.name)) {
          files.push(fullPath)
        }
      }
    }

    return files
  }
}
