import type { Logger } from '../../../src/main/types/logger'
import type { KBSearchResult, KBDocument } from '../types'
import type { DocumentRepository } from '../repositories/document-repository'
import { VectraStore } from './VectraStore'

/** 相似度阈值：低于此分数的结果直接丢弃 */
const SCORE_THRESHOLD = 0.3

/**
 * 向量存储服务
 * 文档元数据 → SQLite（额外信息如 filePath, fileSize, timestamps）
 * 文档内容+向量+BM25 → Vectra LocalDocumentIndex（官方 API）
 */
export class VectorStore {
  private readonly docRepo: DocumentRepository
  private readonly vectra: VectraStore
  private readonly logger: Logger

  constructor(docRepo: DocumentRepository, vectra: VectraStore, logger: Logger) {
    this.docRepo = docRepo
    this.vectra = vectra
    this.logger = logger
  }

  async init(): Promise<void> {
    await this.docRepo.init()
    await this.vectra.init()
    // 同步检查：Vectra 索引为空但 SQLite 有记录 → 说明 indexDir 被更换，清理孤立记录
    const vectraStats = await this.vectra.getStats()
    const docCount = await this.docRepo.count()
    if (vectraStats.chunks === 0 && docCount > 0) {
      this.logger.warn(`索引目录已更换（Vectra 为空，SQLite 有 ${docCount} 条记录），清理孤立数据`)
      await this.docRepo.clearAll()
    }
  }

  async saveDocument(id: string, fileName: string, filePath: string, fileType: string, fileSize: number, chunkCount: number, datasetId?: string, datasetName?: string): Promise<void> {
    await this.docRepo.save({ id, fileName, filePath, fileType, fileSize, chunkCount, createdAt: Date.now(), updatedAt: Date.now(), datasetId, datasetName })
  }

  /**
   * 保存文档到 Vectra（Vectra 自动切片 + 嵌入 + BM25 索引）
   * @param documentId 文档 ID
   * @param text 文档全文
   * @param fileExt 文件扩展名
   */
  async saveToVectra(documentId: string, text: string, fileExt: string): Promise<void> {
    await this.vectra.upsertDocument(documentId, text, fileExt)
  }

  /**
   * 混合检索（推荐）：向量语义 + BM25 关键词，Vectra 官方实现
   */
  async searchHybrid(queryText: string, topK: number = 5): Promise<KBSearchResult[]> {
    const results = await this.vectra.searchHybrid(queryText, topK)
    return this.resolveDocuments(results.filter(r => r.score >= SCORE_THRESHOLD))
  }

  /** 纯向量搜索 */
  async search(queryText: string, topK: number = 5): Promise<KBSearchResult[]> {
    const results = await this.vectra.search(queryText, topK)
    return this.resolveDocuments(results.filter(r => r.score >= SCORE_THRESHOLD))
  }

  /** 从 Vectra 结果解析文档元数据（补全 fileName, filePath） */
  private async resolveDocuments(results: Array<{
    chunkId: string
    documentId: string
    content: string
    chunkIndex: number
    score: number
    source?: string
  }>): Promise<KBSearchResult[]> {
    const docCache = new Map<string, KBDocument>()

    return Promise.all(results.map(async r => {
      if (!docCache.has(r.documentId)) {
        const doc = await this.docRepo.findById(r.documentId)
        if (doc) docCache.set(r.documentId, doc)
      }
      const doc = docCache.get(r.documentId)
      return {
        chunkId: r.chunkId,
        documentId: r.documentId,
        fileName: doc?.fileName ?? '',
        filePath: doc?.filePath ?? '',
        content: r.content,
        score: r.score,
        chunkIndex: r.chunkIndex
      }
    }))
  }

  async listDocuments(): Promise<KBDocument[]> {
    return this.docRepo.findAll()
  }

  async deleteDocument(documentId: string): Promise<boolean> {
    const doc = await this.docRepo.findById(documentId)
    if (!doc) return false
    await this.vectra.deleteDocument(documentId)
    await this.docRepo.removeById(documentId)
    return true
  }

  async getStats(): Promise<{ documents: number; chunks: number }> {
    return this.vectra.getStats()
  }
}
