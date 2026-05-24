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
  /** 来源数据集 ID */
  datasetId?: string
  /** 来源数据集名称 */
  datasetName?: string
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

/** 联网状态信息 */
export interface KBNetworkStatus {
  networkEnabled: boolean
  networkFeatures: string[]
  localFeatures: string[]
}
