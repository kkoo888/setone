import type { DatabaseManager } from '../../../src/main/types/database'
import type { Logger } from '../../../src/main/types/logger'
import type { KBChunk, KBSearchResult } from '../types'

/** SQLite 行类型 */
interface ChunkRow {
  id: string
  document_id: string
  chunk_index: number
  content: string
  embedding: Buffer
  created_at: number
}

interface DocumentRow {
  id: string
  file_name: string
  file_path: string
}

/**
 * 向量存储服务
 * 使用 SQLite 存储文本片段和嵌入向量，支持余弦相似度搜索
 */
export class VectorStore {
  private readonly db: DatabaseManager
  private readonly logger: Logger

  constructor(db: DatabaseManager, logger: Logger) {
    this.db = db
    this.logger = logger
  }

  /**
   * 初始化数据库表
   */
  async init(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS kb_documents (
        id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS kb_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
      )
    `)

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_kb_chunks_document_id ON kb_chunks(document_id)
    `)

    this.logger.info('知识库数据库表已初始化')
  }

  /**
   * 存储文档
   */
  async saveDocument(id: string, fileName: string, filePath: string, fileType: string, fileSize: number, chunkCount: number): Promise<void> {
    const now = Date.now()
    await this.db.run(
      `INSERT OR REPLACE INTO kb_documents (id, file_name, file_path, file_type, file_size, chunk_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, fileName, filePath, fileType, fileSize, chunkCount, now, now]
    )
  }

  /**
   * 存储文本片段及其嵌入向量
   */
  async saveChunks(chunks: KBChunk[]): Promise<void> {
    await this.db.transaction(async () => {
      for (const chunk of chunks) {
        const embeddingBuffer = this.float32ArrayToBuffer(chunk.embedding)
        await this.db.run(
          `INSERT OR REPLACE INTO kb_chunks (id, document_id, chunk_index, content, embedding, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [chunk.id, chunk.documentId, chunk.chunkIndex, chunk.content, embeddingBuffer, chunk.createdAt]
        )
      }
    })
  }

  /**
   * 语义搜索：计算余弦相似度返回 Top-K 结果
   */
  async search(queryEmbedding: number[], topK: number = 5): Promise<KBSearchResult[]> {
    const rows = await this.db.query<ChunkRow>(`
      SELECT c.id, c.document_id, c.chunk_index, c.content, c.embedding, c.created_at,
             d.file_name, d.file_path
      FROM kb_chunks c
      JOIN kb_documents d ON c.document_id = d.id
    `)

    const scored: KBSearchResult[] = []
    for (const row of rows) {
      const chunkEmbedding = this.bufferToFloat32Array(row.embedding)
      const score = this.cosineSimilarity(queryEmbedding, chunkEmbedding)
      scored.push({
        chunkId: row.id,
        documentId: row.document_id,
        fileName: row.file_name,
        filePath: row.file_path,
        content: row.content,
        score,
        chunkIndex: row.chunk_index
      })
    }

    // 按相似度降序排列，取 Top-K
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  /**
   * 获取所有文档
   */
  async listDocuments(): Promise<Array<{
    id: string; fileName: string; filePath: string; fileType: string;
    fileSize: number; chunkCount: number; createdAt: number; updatedAt: number
  }>> {
    return this.db.query(`SELECT * FROM kb_documents ORDER BY created_at DESC`)
  }

  /**
   * 删除文档及其所有片段
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    const result = await this.db.run(`DELETE FROM kb_documents WHERE id = ?`, [documentId])
    await this.db.run(`DELETE FROM kb_chunks WHERE document_id = ?`, [documentId])
    return result.changes > 0
  }

  /**
   * 获取文档片段数
   */
  async getChunkCount(documentId: string): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM kb_chunks WHERE document_id = ?`,
      [documentId]
    )
    return row?.count ?? 0
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

  /**
   * Float32Array → Buffer（用于 SQLite BLOB 存储）
   */
  private float32ArrayToBuffer(arr: number[]): Buffer {
    const float32 = new Float32Array(arr)
    return Buffer.from(float32.buffer)
  }

  /**
   * Buffer → Float32Array（从 SQLite BLOB 读取）
   */
  private bufferToFloat32Array(buf: Buffer): number[] {
    const float32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
    return Array.from(float32)
  }
}
