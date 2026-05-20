import type { Logger } from '../../../src/main/types/logger'
import type { MemoryRepository } from '../repositories/memory-repository'

export interface MemoryItem {
  id: string
  content: string
  type: 'short-term' | 'long-term'
  tags: string[]
  timestamp: number
  embedding?: number[]
  metadata?: Record<string, unknown>
}

export interface SearchResult {
  item: MemoryItem
  score: number
}

/**
 * TF-IDF 文档索引
 * 用于语义搜索的词频-逆文档频率计算
 */
interface TfIdfDocument {
  id: string
  terms: Map<string, number> // term → tf-idf weight
  length: number // 向量长度（用于余弦相似度）
}

export class MemoryManager {
  private shortTerm: MemoryItem[] = []
  private longTerm: MemoryItem[] = []
  private logger: Logger
  private maxShortTerm: number
  private maxLongTerm: number
  private repository: MemoryRepository
  /** 自动摘要阈值：短期记忆超过此数量时触发自动压缩 */
  private autoSummarizeThreshold: number
  /** 摘要回调：当需要自动摘要时调用 */
  private onAutoSummarize: ((items: MemoryItem[]) => Promise<string>) | null = null

  /** TF-IDF 索引（每次 save/delete 后重建） */
  private tfidfIndex: TfIdfDocument[] = []
  private idf: Map<string, number> = new Map()
  private indexDirty = true

  constructor(
    repository: MemoryRepository,
    logger: Logger,
    settings?: {
      shortTermMaxItems?: number
      longTermMaxItems?: number
      autoSummarizeThreshold?: number
    }
  ) {
    this.repository = repository
    this.logger = logger
    this.maxShortTerm = settings?.shortTermMaxItems ?? 100
    this.maxLongTerm = settings?.longTermMaxItems ?? 10000
    this.autoSummarizeThreshold = settings?.autoSummarizeThreshold ?? 50
  }

  /**
   * 设置自动摘要回调
   * 当短期记忆超过阈值时，调用此回调生成摘要并保存为长期记忆
   */
  setAutoSummarizeHandler(handler: (items: MemoryItem[]) => Promise<string>): void {
    this.onAutoSummarize = handler
  }

  /**
   * 初始化：建表 + 从数据库加载记忆
   */
  async init(): Promise<void> {
    await this.repository.init()
    await this.loadFromDatabase()
  }

  /**
   * 从数据库加载所有记忆到内存
   */
  async loadFromDatabase(): Promise<void> {
    const rows = await this.repository.findAll()

    this.shortTerm = []
    this.longTerm = []
    for (const item of rows) {
      if (item.type === 'short-term') {
        this.shortTerm.push(item)
      } else {
        this.longTerm.push(item)
      }
    }
    this.indexDirty = true
    this.logger.info(`从数据库加载记忆: 短期 ${this.shortTerm.length} 条, 长期 ${this.longTerm.length} 条`)
  }

  /**
   * 保存记忆
   * 同时写入内存和数据库，短期记忆超过阈值时自动触发摘要
   */
  async save(
    content: string,
    type: 'short-term' | 'long-term' = 'short-term',
    tags: string[] = [],
    metadata?: Record<string, unknown>
  ): Promise<MemoryItem> {
    const item: MemoryItem = {
      id: crypto.randomUUID(),
      content,
      type,
      tags,
      timestamp: Date.now(),
      metadata
    }

    // 写入内存
    if (type === 'short-term') {
      this.shortTerm.push(item)
      if (this.shortTerm.length > this.maxShortTerm) this.shortTerm.shift()
    } else {
      this.longTerm.push(item)
      if (this.longTerm.length > this.maxLongTerm) this.longTerm.shift()
    }

    // 通过 repository 持久化
    await this.repository.save(item)
    this.indexDirty = true
    this.logger.info(`记忆已保存: ${item.id} (${type})`)

    // 检查是否需要自动摘要
    if (type === 'short-term' && this.shortTerm.length >= this.autoSummarizeThreshold) {
      await this.triggerAutoSummarize()
    }

    return item
  }

  /**
   * 语义搜索（基于 TF-IDF + 余弦相似度）
   * 同时保留关键词精确匹配作为补充
   * 注意：此方法仅操作内存索引，不需要 async
   */
  search(query: string, limit = 10): SearchResult[] {
    this.rebuildIndexIfNeeded()

    const all = [...this.shortTerm, ...this.longTerm]
    if (all.length === 0) return []

    // TF-IDF 语义搜索
    const queryTerms = this.tokenize(query)
    const queryTf = this.computeTf(queryTerms)
    const queryVec = new Map<string, number>()
    for (const [term, tf] of queryTf) {
      const idfVal = this.idf.get(term) ?? 0
      queryVec.set(term, tf * idfVal)
    }
    const queryLen = this.vectorLength(queryVec)

    const tfidfResults: SearchResult[] = []
    for (const doc of this.tfidfIndex) {
      const score = this.cosineSimilarity(queryVec, queryLen, doc.terms, doc.length)
      if (score > 0.01) {
        const item = all.find((m) => m.id === doc.id)
        if (item) tfidfResults.push({ item, score })
      }
    }

    // 关键词精确匹配作为补充
    const queryLower = query.toLowerCase()
    const exactResults: SearchResult[] = []
    for (const item of all) {
      const contentLower = item.content.toLowerCase()
      let score = 0
      if (contentLower.includes(queryLower)) {
        score = 1.0
      } else {
        const words = queryLower.split(/\s+/)
        const matched = words.filter((w) => contentLower.includes(w)).length
        score = matched / words.length
      }
      if (score > 0) exactResults.push({ item, score })
    }

    // 合并结果：精确匹配权重 0.6，TF-IDF 权重 0.4
    const scoreMap = new Map<string, number>()
    for (const r of exactResults) {
      scoreMap.set(r.item.id, (scoreMap.get(r.item.id) ?? 0) + r.score * 0.6)
    }
    for (const r of tfidfResults) {
      scoreMap.set(r.item.id, (scoreMap.get(r.item.id) ?? 0) + r.score * 0.4)
    }

    const merged: SearchResult[] = []
    for (const [id, score] of scoreMap) {
      const item = all.find((m) => m.id === id)
      if (item) merged.push({ item, score })
    }

    return merged.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  /**
   * 删除记忆
   * 同时从内存和数据库中移除
   */
  async delete(id: string): Promise<boolean> {
    const sIdx = this.shortTerm.findIndex((m) => m.id === id)
    if (sIdx >= 0) {
      this.shortTerm.splice(sIdx, 1)
      await this.repository.removeById(id)
      this.indexDirty = true
      return true
    }
    const lIdx = this.longTerm.findIndex((m) => m.id === id)
    if (lIdx >= 0) {
      this.longTerm.splice(lIdx, 1)
      await this.repository.removeById(id)
      this.indexDirty = true
      return true
    }
    return false
  }

  /** 获取短期记忆 */
  getShortTerm(): MemoryItem[] {
    return [...this.shortTerm]
  }

  /** 获取长期记忆 */
  getLongTerm(): MemoryItem[] {
    return [...this.longTerm]
  }

  /**
   * 将短期记忆升级为长期记忆
   * 同步更新数据库中的 type 字段
   */
  async promote(id: string): Promise<boolean> {
    const idx = this.shortTerm.findIndex((m) => m.id === id)
    if (idx < 0) return false
    const item = this.shortTerm.splice(idx, 1)[0]
    item.type = 'long-term'
    this.longTerm.push(item)
    await this.repository.updateType(id, 'long-term')
    this.indexDirty = true
    return true
  }

  /** 获取短期记忆数量 */
  getShortTermCount(): number {
    return this.shortTerm.length
  }

  // ──── TF-IDF 引擎 ────

  /**
   * 中文分词（基于 Unicode 范围的简易分词）
   * 将文本拆分为：中文字符（逐字）、英文单词、数字
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = []
    // 匹配中文字符、英文单词、数字
    const regex = /[\u4e00-\u9fff]|[a-zA-Z]+|[0-9]+/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const token = match[0].toLowerCase()
      // 过滤停用词和单字符
      if (token.length > 1 || /[\u4e00-\u9fff]/.test(token)) {
        tokens.push(token)
      }
    }
    return tokens
  }

  /**
   * 计算词频（TF）
   */
  private computeTf(tokens: string[]): Map<string, number> {
    const freq = new Map<string, number>()
    for (const t of tokens) {
      freq.set(t, (freq.get(t) ?? 0) + 1)
    }
    // 归一化
    const maxFreq = Math.max(...freq.values(), 1)
    const tf = new Map<string, number>()
    for (const [term, count] of freq) {
      tf.set(term, 0.5 + 0.5 * (count / maxFreq))
    }
    return tf
  }

  /**
   * 重建 TF-IDF 索引（仅在数据变化时执行）
   */
  private rebuildIndexIfNeeded(): void {
    if (!this.indexDirty) return

    const all = [...this.shortTerm, ...this.longTerm]
    const docCount = all.length
    if (docCount === 0) {
      this.tfidfIndex = []
      this.idf = new Map()
      this.indexDirty = false
      return
    }

    // 计算 IDF
    const docFreq = new Map<string, number>()
    const docTokens: Map<string, string[]> = new Map()

    for (const item of all) {
      const tokens = this.tokenize(item.content)
      docTokens.set(item.id, tokens)
      const unique = new Set(tokens)
      for (const term of unique) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1)
      }
    }

    this.idf = new Map()
    for (const [term, df] of docFreq) {
      this.idf.set(term, Math.log((docCount + 1) / (df + 1)) + 1)
    }

    // 构建文档向量
    this.tfidfIndex = []
    for (const item of all) {
      const tokens = docTokens.get(item.id) ?? []
      const tf = this.computeTf(tokens)
      const vec = new Map<string, number>()
      for (const [term, tfVal] of tf) {
        const idfVal = this.idf.get(term) ?? 0
        vec.set(term, tfVal * idfVal)
      }
      this.tfidfIndex.push({
        id: item.id,
        terms: vec,
        length: this.vectorLength(vec)
      })
    }

    this.indexDirty = false
  }

  /** 计算向量长度 */
  private vectorLength(vec: Map<string, number>): number {
    let sum = 0
    for (const val of vec.values()) {
      sum += val * val
    }
    return Math.sqrt(sum)
  }

  /** 余弦相似度 */
  private cosineSimilarity(
    a: Map<string, number>,
    aLen: number,
    b: Map<string, number>,
    bLen: number
  ): number {
    if (aLen === 0 || bLen === 0) return 0
    let dot = 0
    for (const [term, aVal] of a) {
      const bVal = b.get(term)
      if (bVal !== undefined) {
        dot += aVal * bVal
      }
    }
    return dot / (aLen * bLen)
  }

  // ──── 自动摘要 ────

  /**
   * 自动摘要：当短期记忆超过阈值时，压缩为一条长期记忆
   * 注意：内部调用 this.save(summary, 'long-term')，但不会再次触发摘要，
   * 因为 save() 仅在 type === 'short-term' 时检查阈值
   */
  private async triggerAutoSummarize(): Promise<void> {
    if (!this.onAutoSummarize || this.shortTerm.length === 0) return

    this.logger.info(`短期记忆达到 ${this.shortTerm.length} 条，触发自动摘要`)
    const itemsToSummarize = [...this.shortTerm]
    const summary = await this.onAutoSummarize(itemsToSummarize)
    if (summary) {
      // 清空已摘要的短期记忆
      await this.repository.removeBatch(itemsToSummarize.map((i) => i.id))
      this.shortTerm = []

      // 保存摘要为长期记忆
      const summaryTags = ['auto-summary', 'compressed']
      const summaryMeta = {
        sourceCount: itemsToSummarize.length,
        sourceIds: itemsToSummarize.map((i) => i.id),
        summarizedAt: Date.now()
      }
      await this.save(summary, 'long-term', summaryTags, summaryMeta)
      this.logger.info(`自动摘要完成: ${itemsToSummarize.length} 条 → 1 条长期记忆`)
    }
  }
}
