import type { Logger } from '../../../src/main/types/logger'
import type { KBChunk, KBSearchResult, KBDocument } from '../types'
import type { DocumentRepository } from '../repositories/document-repository'
import { VectraStore } from './VectraStore'

/**
 * 向量存储服务
 * 文档元数据 → SQLite，片段向量+内容 → Vectra
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
  }

  async saveDocument(id: string, fileName: string, filePath: string, fileType: string, fileSize: number, chunkCount: number): Promise<void> {
    await this.docRepo.save({ id, fileName, filePath, fileType, fileSize, chunkCount, createdAt: Date.now(), updatedAt: Date.now() })
  }

  async saveChunks(chunks: KBChunk[]): Promise<void> {
    const items = chunks.filter(c => c.embedding.length > 0).map(c => ({
      id: c.id, vector: c.embedding, content: c.content, documentId: c.documentId, chunkIndex: c.chunkIndex
    }))
    if (items.length > 0) await this.vectra.upsertChunks(items)
  }

  async search(queryEmbedding: number[], topK: number = 5): Promise<KBSearchResult[]> {
    const results = await this.vectra.search(queryEmbedding, topK)
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
    await this.vectra.deleteByDocumentId(documentId)
    await this.docRepo.removeById(documentId)
    return true
  }

  async getChunkCount(documentId: string): Promise<number> {
    return (await this.vectra.listByDocumentId(documentId)).length
  }
}
