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
  /** 联网开关：控制 Embedding 和 AI 调用，不影响本地文件操作和搜索 */
  networkEnabled: boolean
  /** 临时文件目录（用于 ZIP 解压等） */
  tempDir?: string
  /** 原始文件存储目录（下载/导入的原始文件备份） */
  rawDir?: string
  /** 索引目录（Vectra 向量+BM25 索引） */
  indexDir?: string
}

/** 联网状态信息 */
export interface KBNetworkStatus {
  networkEnabled: boolean
  /** 原始文件目录 */
  rawDir: string
  /** 索引目录 */
  indexDir: string
  /** 联网功能列表 */
  networkFeatures: string[]
  /** 本地功能列表（不受联网开关影响） */
  localFeatures: string[]
}
