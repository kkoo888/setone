import { LocalDocumentIndex, OpenAIEmbeddings, LocalDocumentResult } from 'vectra'
import { join } from 'path'
import type { Logger } from '../../../src/main/types/logger'

/** Vectra docType 映射：文件扩展名 → Vectra 切片提示 */
const DOC_TYPE_MAP: Record<string, string> = {
  '.md': 'md', '.txt': 'txt', '.html': 'html', '.htm': 'html',
  '.xml': 'xml', '.json': 'json', '.csv': 'csv', '.yaml': 'yaml',
  '.yml': 'yaml', '.py': 'py', '.ts': 'ts', '.js': 'js',
  '.pdf': 'txt', '.docx': 'txt', '.parquet': 'txt'
}

/**
 * Vectra 向量存储
 * 使用官方 LocalDocumentIndex：切片、嵌入、BM25 混合检索全部由 Vectra 处理
 *
 * - 嵌入：OpenAIEmbeddings 兼容 Ollama /v1/embeddings 端点
 * - 切片：Vectra TextSplitter（按 docType 自动选分隔符）
 * - 检索：queryDocuments + isBm25 混合搜索
 */
export class VectraStore {
  private docIndex: LocalDocumentIndex | null = null
  private readonly folderPath: string
  private readonly logger: Logger
  private readonly embeddingEndpoint: string
  private readonly embeddingModel: string
  private readonly chunkSize: number
  private readonly chunkOverlap: number

  constructor(
    dataDir: string,
    logger: Logger,
    embeddingEndpoint: string = 'http://localhost:11434',
    embeddingModel: string = 'nomic-embed-text',
    chunkSize: number = 512,
    chunkOverlap: number = 64
  ) {
    this.folderPath = join(dataDir, 'vectra-doc-index')
    this.logger = logger
    this.embeddingEndpoint = embeddingEndpoint
    this.embeddingModel = embeddingModel
    this.chunkSize = chunkSize
    this.chunkOverlap = chunkOverlap
  }

  async init(): Promise<void> {
    const embeddings = new OpenAIEmbeddings({
      ossEndpoint: this.embeddingEndpoint,
      ossModel: this.embeddingModel,
      maxTokens: 8000
    })

    this.docIndex = new LocalDocumentIndex({
      folderPath: this.folderPath,
      embeddings,
      chunkingConfig: {
        chunkSize: this.chunkSize,
        chunkOverlap: this.chunkOverlap,
        keepSeparators: true
      }
    })

    if (!(await this.docIndex.isIndexCreated())) {
      await this.docIndex.createIndex({ version: 1 })
    }

    const stats = await this.docIndex.getCatalogStats().catch(() => null)
    this.logger.info(`Vectra 文档索引已就绪: ${stats?.documents ?? 0} 文档, ${stats?.chunks ?? 0} 片段`)
  }

  /**
   * 写入文档（Vectra 自动切片 + 嵌入 + 索引）
   * @param documentId 文档唯一 ID
   * @param text 文档全文
   * @param fileExt 文件扩展名（如 '.md'），用于 Vectra 选择切片策略
   */
  async upsertDocument(documentId: string, text: string, fileExt: string): Promise<void> {
    const uri = `kb://${documentId}`
    const docType = DOC_TYPE_MAP[fileExt] ?? 'txt'
    await this.docIndex!.upsertDocument(uri, text, docType)
  }

  /**
   * 混合检索（向量语义 + BM25 关键词）
   * Vectra 官方实现，isBm25: true 自动融合语义 + 关键词匹配
   */
  async searchHybrid(query: string, topK: number): Promise<Array<{
    chunkId: string
    documentId: string
    content: string
    chunkIndex: number
    score: number
    source: 'vector' | 'bm25' | 'hybrid'
  }>> {
    const results = await this.docIndex!.queryDocuments(query, {
      maxDocuments: topK,
      maxChunks: topK * 3,
      isBm25: true
    })

    return this.extractResults(results, topK)
  }

  /**
   * 纯向量检索（语义匹配）
   */
  async search(query: string, topK: number): Promise<Array<{
    chunkId: string
    documentId: string
    content: string
    chunkIndex: number
    score: number
    source: 'vector'
  }>> {
    const results = await this.docIndex!.queryDocuments(query, {
      maxDocuments: topK,
      maxChunks: topK * 3,
      isBm25: false
    })

    return this.extractResults(results, topK)
  }

  /** 从 Vectra 结果提取扁平化片段列表 */
  private async extractResults(results: LocalDocumentResult[], topK: number) {
    const flat: Array<{
      chunkId: string
      documentId: string
      content: string
      chunkIndex: number
      score: number
      source: 'vector' | 'bm25' | 'hybrid'
    }> = []

    for (const docResult of results) {
      // 从 URI 提取 documentId: kb://{documentId}
      const documentId = docResult.uri.replace('kb://', '')

      // 渲染 sections 获取实际文本
      const sections = await docResult.renderSections(2000, docResult.chunks.length, false)

      for (let i = 0; i < sections.length && flat.length < topK; i++) {
        const section = sections[i]
        flat.push({
          chunkId: `${documentId}_section_${i}`,
          documentId,
          content: section.text,
          chunkIndex: i,
          score: section.score,
          source: section.isBm25 ? 'bm25' : 'vector'
        })
      }
    }

    return flat
  }

  /** 按文档删除 */
  async deleteDocument(documentId: string): Promise<void> {
    await this.docIndex!.deleteDocument(`kb://${documentId}`)
  }

  /** 列出所有文档 URI */
  async listDocumentUris(): Promise<string[]> {
    const docs = await this.docIndex!.listDocuments()
    return docs.map(d => d.uri)
  }

  /** 获取文档统计 */
  async getStats(): Promise<{ documents: number; chunks: number }> {
    const stats = await this.docIndex!.getCatalogStats()
    return { documents: stats.documents, chunks: stats.chunks }
  }

  /** 按 documentId 查询文档（检查是否存在） */
  async hasDocument(documentId: string): Promise<boolean> {
    const id = await this.docIndex!.getDocumentId(`kb://${documentId}`)
    return id !== undefined
  }
}
