/** 知识库文档元数据 */
export interface KBDocument {
  id: string
  fileName: string
  filePath: string
  fileType: string
  fileSize: number
  chunkCount: number
  createdAt: number
  updatedAt: number
}

/** 知识库文本片段 */
export interface KBChunk {
  id: string
  documentId: string
  chunkIndex: number
  content: string
  embedding: number[]
  createdAt: number
}

/** 语义搜索结果 */
export interface KBSearchResult {
  chunkId: string
  documentId: string
  fileName: string
  filePath: string
  content: string
  score: number
  chunkIndex: number
}

/** RAG 回答结果 */
export interface KBAskResult {
  answer: string
  sources: KBSearchResult[]
}

/** 导入结果 */
export interface KBImportResult {
  documentId: string
  fileName: string
  chunkCount: number
  success: boolean
  error?: string
}

/** 知识库设置 */
export interface KBSettings {
  chunkSize: number
  chunkOverlap: number
  embeddingModel: string
  maxDocuments: number
  supportedFormats: string[]
  autoReindex: boolean
}
