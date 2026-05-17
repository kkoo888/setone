import { readFile, stat, readdir } from 'fs/promises'
import { join, extname, basename } from 'path'
import { randomUUID } from 'crypto'
import type { Logger } from '../../../src/main/types/logger'
import type { KBDocument, KBChunk, KBImportResult, KBSettings } from '../types'
import { Chunker } from './Chunker'
import { EmbeddingService } from './EmbeddingService'
import { VectorStore } from './VectorStore'

/**
 * 知识库管理器
 * 负责文件导入、文本提取、切片、向量化和存储
 */
export class KBManager {
  private readonly logger: Logger
  private readonly chunker: Chunker
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
    this.chunker = new Chunker(settings.chunkSize, settings.chunkOverlap)
  }

  /**
   * 导入文件或目录到知识库
   * @param path - 文件或目录路径
   * @returns 导入结果数组
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
      const result = await this.importFile(path)
      results.push(result)
    }

    return results
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
      // 读取文件内容
      const content = await this.extractText(filePath, ext)
      if (!content || content.trim().length === 0) {
        return {
          documentId: '',
          fileName,
          chunkCount: 0,
          success: false,
          error: '文件内容为空'
        }
      }

      // 文本切片
      const textChunks = this.chunker.chunk(content)
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

      // 批量生成嵌入向量
      const embeddings = await this.embeddingService.embedBatch(textChunks)

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
   * 提取文件文本内容
   */
  private async extractText(filePath: string, ext: string): Promise<string> {
    // 对于文本类文件直接读取
    const textFormats = ['.md', '.txt', '.json', '.csv', '.ts', '.js', '.py']
    if (textFormats.includes(ext)) {
      return await readFile(filePath, 'utf-8')
    }

    // PDF 和 DOCX 等二进制格式，暂时返回空并记录警告
    // TODO: 集成 pdf-parse 和 mammoth 库
    if (ext === '.pdf' || ext === '.docx') {
      this.logger.warn(`暂不支持 ${ext} 格式的文本提取，跳过: ${filePath}`)
      return ''
    }

    return await readFile(filePath, 'utf-8')
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
        if (this.settings.supportedFormats.includes(ext)) {
          files.push(fullPath)
        }
      }
    }

    return files
  }
}
