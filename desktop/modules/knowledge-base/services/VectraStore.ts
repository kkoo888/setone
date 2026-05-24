import { LocalIndex } from 'vectra'
import { join } from 'path'
import type { Logger } from '../../../src/main/types/logger'

/**
 * Vectra 向量存储
 * 向量 + 片段内容 + 元数据，一站管理
 */
export class VectraStore {
  private index: LocalIndex | null = null
  private readonly indexPath: string
  private readonly logger: Logger

  constructor(dataDir: string, logger: Logger) {
    this.indexPath = join(dataDir, 'vectra-index')
    this.logger = logger
  }

  async init(): Promise<void> {
    this.index = new LocalIndex(this.indexPath)
    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex({
        version: 1,
        metadata_config: { indexed: ['documentId'] }
      })
    }
  }

  /** 写入片段（向量 + 内容 + 元数据） */
  async upsertChunks(chunks: Array<{
    id: string
    vector: number[]
    content: string
    documentId: string
    chunkIndex: number
  }>): Promise<void> {
    for (const c of chunks) {
      await this.index!.upsertItem({
        id: c.id,
        vector: c.vector,
        metadata: { documentId: c.documentId, chunkIndex: c.chunkIndex, content: c.content }
      })
    }
  }

  /** 向量搜索，返回完整结果 */
  async search(queryVector: number[], topK: number): Promise<Array<{
    chunkId: string
    documentId: string
    content: string
    chunkIndex: number
    score: number
  }>> {
    const results = await this.index!.queryItems(queryVector, '', topK)
    return results.map(r => ({
      chunkId: r.item.id,
      documentId: r.item.metadata.documentId as string,
      content: r.item.metadata.content as string,
      chunkIndex: r.item.metadata.chunkIndex as number,
      score: r.score
    }))
  }

  /** 按文档删除所有片段 */
  async deleteByDocumentId(documentId: string): Promise<void> {
    const items = await this.index!.listItems()
    for (const item of items) {
      if (item.metadata.documentId === documentId) {
        await this.index!.deleteItem(item.id)
      }
    }
  }

  /** 按文档获取片段（用于统计/重建） */
  async listByDocumentId(documentId: string): Promise<Array<{ id: string; content: string; chunkIndex: number }>> {
    const items = await this.index!.listItems()
    return items
      .filter(i => i.metadata.documentId === documentId)
      .map(i => ({ id: i.id, content: i.metadata.content as string, chunkIndex: i.metadata.chunkIndex as number }))
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
  }

  async count(): Promise<number> {
    return (await this.index!.listItems()).length
  }
}
