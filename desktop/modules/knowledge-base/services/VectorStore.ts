import type { Logger } from '../../../src/main/types/logger'
import type { KBChunk, KBSearchResult, KBDocument } from '../types'
import type { DocumentRepository } from '../repositories/document-repository'
import type { ChunkRepository } from '../repositories/chunk-repository'

/**
 * 向量存储服务（Service 层）
 * 协调 Repository 完成业务逻辑，保留向量相似度搜索核心能力
 */
export class VectorStore {
  private readonly docRepo: DocumentRepository
  private readonly chunkRepo: ChunkRepository
  private readonly logger: Logger

  constructor(docRepo: DocumentRepository, chunkRepo: ChunkRepository, logger: Logger) {
    this.docRepo = docRepo
    this.chunkRepo = chunkRepo
    this.logger = logger
  }

  /**
   * 初始化：委托两个 Repository 建表
   */
  async init(): Promise<void> {
    await this.docRepo.init()
    await this.chunkRepo.init()
    this.logger.info('知识库数据库表已初始化')
  }

  /**
   * 存储文档（委托 DocumentRepository）
   */
  async saveDocument(
    id: string,
    fileName: string,
    filePath: string,
    fileType: string,
    fileSize: number,
    chunkCount: number
  ): Promise<void> {
    const now = Date.now()
    const doc: KBDocument = {
      id,
      fileName,
      filePath,
      fileType,
      fileSize,
      chunkCount,
      createdAt: now,
      updatedAt: now
    }
    await this.docRepo.save(doc)
  }

  /**
   * 存储文本片段（委托 ChunkRepository）
   */
  async saveChunks(chunks: KBChunk[]): Promise<void> {
    await this.chunkRepo.saveAll(chunks)
  }

  /**
   * 语义搜索：从 chunkRepo 获取向量 + 计算余弦相似度
   */
  async search(queryEmbedding: number[], topK: number = 5): Promise<KBSearchResult[]> {
    const chunksWithEmbedding = await this.chunkRepo.findAllWithEmbedding()

    const scored: KBSearchResult[] = []
    for (const chunk of chunksWithEmbedding) {
      const score = this.cosineSimilarity(queryEmbedding, Array.from(chunk.embedding))
      scored.push({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        fileName: '',   // JOIN 字段不在 chunk 实体中，需从 docRepo 补
        filePath: '',
        content: chunk.content,
        score,
        chunkIndex: chunk.chunkIndex
      })
    }

    // 按相似度降序排列，取 Top-K
    scored.sort((a, b) => b.score - a.score)
    const topResults = scored.slice(0, topK)

    // 补充文档信息
    const docIds = [...new Set(topResults.map(r => r.documentId))]
    const docMap = new Map<string, KBDocument>()
    for (const docId of docIds) {
      const doc = await this.docRepo.findById(docId)
      if (doc) docMap.set(docId, doc)
    }
    for (const result of topResults) {
      const doc = docMap.get(result.documentId)
      if (doc) {
        result.fileName = doc.fileName
        result.filePath = doc.filePath
      }
    }

    return topResults
  }

  /**
   * 获取所有文档（委托 DocumentRepository）
   */
  async listDocuments(): Promise<KBDocument[]> {
    return this.docRepo.findAll()
  }

  /**
   * 删除文档及其所有片段（事务内删除）
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    const doc = await this.docRepo.findById(documentId)
    if (!doc) return false

    await this.chunkRepo.removeByDocumentId(documentId)
    await this.docRepo.removeById(documentId)
    return true
  }

  /**
   * 获取文档片段数
   */
  async getChunkCount(documentId: string): Promise<number> {
    const chunks = await this.chunkRepo.findByDocumentId(documentId)
    return chunks.length
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    if (denominator === 0) return 0

    return dotProduct / denominator
  }
}
