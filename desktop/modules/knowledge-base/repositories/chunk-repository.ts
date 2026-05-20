import type { DatabaseManager } from '../../../../src/main/types/database'
import type { KBChunk } from '../types'

/** SQLite 行类型 */
interface ChunkRow {
  id: string
  document_id: string
  chunk_index: number
  content: string
  embedding: Buffer
  created_at: number
}

export class ChunkRepository {
  private readonly db: DatabaseManager

  constructor(db: DatabaseManager) {
    this.db = db
  }

  async init(): Promise<void> {
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
  }

  async findByDocumentId(documentId: string): Promise<KBChunk[]> {
    const rows = await this.db.query<ChunkRow>(
      `SELECT * FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index`,
      [documentId]
    )
    return rows.map(row => this.toEntity(row))
  }

  async findAllWithEmbedding(): Promise<Array<KBChunk & { embedding: Float32Array }>> {
    const rows = await this.db.query<ChunkRow>(`
      SELECT c.id, c.document_id, c.chunk_index, c.content, c.embedding, c.created_at,
             d.file_name, d.file_path
      FROM kb_chunks c
      JOIN kb_documents d ON c.document_id = d.id
    `)

    return rows
      .map(row => {
        const embedding = this.bufferToFloat32Array(row.embedding)
        if (embedding.length === 0) return null
        return {
          ...this.toEntity(row),
          embedding
        }
      })
      .filter((item): item is KBChunk & { embedding: Float32Array } => item !== null)
  }

  async saveAll(chunks: KBChunk[]): Promise<void> {
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

  async removeByDocumentId(documentId: string): Promise<void> {
    await this.db.run(`DELETE FROM kb_chunks WHERE document_id = ?`, [documentId])
  }

  private toEntity(row: ChunkRow): KBChunk {
    return {
      id: row.id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      embedding: Array.from(this.bufferToFloat32Array(row.embedding)),
      createdAt: row.created_at
    }
  }

  private float32ArrayToBuffer(arr: number[]): Buffer {
    const float32 = new Float32Array(arr)
    return Buffer.from(float32.buffer)
  }

  private bufferToFloat32Array(buf: Buffer): Float32Array {
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  }
}
