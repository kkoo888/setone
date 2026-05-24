import type { DatabaseManager } from '../../../../src/main/types/database'
import type { KBDocument } from '../types'

/** SQLite 行类型 */
interface DocumentRow {
  id: string
  file_name: string
  file_path: string
  file_type: string
  file_size: number
  chunk_count: number
  created_at: number
  updated_at: number
  dataset_id: string | null
  dataset_name: string | null
}

export class DocumentRepository {
  private readonly db: DatabaseManager

  constructor(db: DatabaseManager) {
    this.db = db
  }

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
        updated_at INTEGER NOT NULL,
        dataset_id TEXT,
        dataset_name TEXT
      )
    `)
    // 迁移：添加 dataset_id / dataset_name 列（已有则跳过）
    try { await this.db.run(`ALTER TABLE kb_documents ADD COLUMN dataset_id TEXT`) } catch { /* 已存在 */ }
    try { await this.db.run(`ALTER TABLE kb_documents ADD COLUMN dataset_name TEXT`) } catch { /* 已存在 */ }
  }

  async findById(id: string): Promise<KBDocument | undefined> {
    const row = await this.db.get<DocumentRow>(
      `SELECT * FROM kb_documents WHERE id = ?`,
      [id]
    )
    return row ? this.toEntity(row) : undefined
  }

  async findAll(): Promise<KBDocument[]> {
    const rows = await this.db.query<DocumentRow>(
      `SELECT * FROM kb_documents ORDER BY created_at DESC`
    )
    return rows.map(row => this.toEntity(row))
  }

  async save(doc: KBDocument): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO kb_documents (id, file_name, file_path, file_type, file_size, chunk_count, created_at, updated_at, dataset_id, dataset_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [doc.id, doc.fileName, doc.filePath, doc.fileType, doc.fileSize, doc.chunkCount, doc.createdAt, doc.updatedAt, doc.datasetId ?? null, doc.datasetName ?? null]
    )
  }

  async removeById(id: string): Promise<boolean> {
    const result = await this.db.run(`DELETE FROM kb_documents WHERE id = ?`, [id])
    return result.changes > 0
  }

  async updateChunkCount(id: string, count: number): Promise<void> {
    await this.db.run(
      `UPDATE kb_documents SET chunk_count = ?, updated_at = ? WHERE id = ?`,
      [count, Date.now(), id]
    )
  }

  async count(): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM kb_documents`
    )
    return row?.count ?? 0
  }

  async clearAll(): Promise<void> {
    await this.db.run(`DELETE FROM kb_documents`)
  }

  private toEntity(row: DocumentRow): KBDocument {
    return {
      id: row.id,
      fileName: row.file_name,
      filePath: row.file_path,
      fileType: row.file_type,
      fileSize: row.file_size,
      chunkCount: row.chunk_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      datasetId: row.dataset_id ?? undefined,
      datasetName: row.dataset_name ?? undefined,
    }
  }
}
