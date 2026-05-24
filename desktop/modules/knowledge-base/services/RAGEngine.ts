import type { AIService, ChatMessage } from '../../../src/main/types/ai'
import type { Logger } from '../../../src/main/types/logger'
import type { KBSearchResult, KBAskResult } from '../types'
import { VectorStore } from './VectorStore'

/** RAG 系统提示词 */
const RAG_SYSTEM_PROMPT = `你是一个基于本地知识库的问答助手。根据提供的参考资料回答用户问题。
要求：
1. 仅基于提供的参考资料回答，不要编造信息
2. 如果参考资料中没有相关信息，明确告知用户
3. 回答时引用来源（文件名和片段编号）
4. 回答简洁准确，使用中文`

/** Reranker 提示词 */
const RERANK_PROMPT = `你是一个文档相关性评估器。给定用户查询和一组文档片段，按相关性从高到低排序。
规则：
1. 只输出排序后的编号（如 "3,1,5,2,4"），不要解释
2. 相关性判断基于：是否直接回答或包含查询所需的信息
3. 完全不相关的片段排到后面`

/**
 * RAG 问答引擎
 * 混合检索（Vectra 向量+BM25）→ LLM 精排 → AI 生成回答
 */
export class RAGEngine {
  private readonly logger: Logger
  private readonly vectorStore: VectorStore
  private readonly ai: AIService
  private networkEnabled: boolean

  constructor(logger: Logger, vectorStore: VectorStore, ai: AIService) {
    this.logger = logger
    this.vectorStore = vectorStore
    this.ai = ai
    this.networkEnabled = true
  }

  setNetworkEnabled(enabled: boolean): void {
    this.networkEnabled = enabled
    this.logger.info(`RAGEngine 联网状态: ${enabled ? '已开启' : '已关闭'}`)
  }

  /**
   * RAG 问答：混合检索 → LLM Reranker → AI 回答
   */
  async ask(question: string, topK: number = 5): Promise<KBAskResult> {
    if (!this.networkEnabled) {
      throw new Error('联网功能已关闭，无法进行 RAG 问答。请在知识库设置中开启联网后重试。')
    }

    // 1. 混合检索（向量 + BM25），多取候选用于精排
    const candidateK = Math.max(topK * 3, 15)
    let candidates = await this.vectorStore.searchHybrid(question, candidateK)

    if (candidates.length === 0) {
      return {
        answer: '知识库中没有找到相关信息，请先导入相关文档。',
        sources: []
      }
    }

    // 2. LLM Reranker 精排
    candidates = await this.rerank(question, candidates, topK)

    // 3. 拼接上下文 + AI 生成回答
    const context = this.buildContext(candidates)
    const messages: ChatMessage[] = [
      { role: 'system', content: RAG_SYSTEM_PROMPT },
      { role: 'user', content: `参考资料：\n${context}\n\n用户问题：${question}` }
    ]

    const response = await this.ai.chat(messages, { temperature: 0.3, maxTokens: 2000 })

    return { answer: response.message.content, sources: candidates }
  }

  /**
   * LLM Reranker：用已有 LLM 对候选片段做精排（零成本）
   */
  private async rerank(query: string, candidates: KBSearchResult[], topK: number): Promise<KBSearchResult[]> {
    if (candidates.length <= topK) return candidates

    try {
      const docList = candidates
        .map((c, i) => `${i + 1}. [${c.fileName}#${c.chunkIndex}] ${c.content.substring(0, 200)}`)
        .join('\n')

      const messages: ChatMessage[] = [
        { role: 'system', content: RERANK_PROMPT },
        { role: 'user', content: `查询：${query}\n\n文档片段：\n${docList}\n\n按相关性排序，只输出编号：` }
      ]

      const response = await this.ai.chat(messages, { temperature: 0, maxTokens: 100 })

      const order = response.message.content
        .match(/\d+/g)
        ?.map(n => parseInt(n) - 1)
        .filter(i => i >= 0 && i < candidates.length) ?? []

      if (order.length === 0) {
        this.logger.warn('Reranker 解析失败，使用原始排序')
        return candidates.slice(0, topK)
      }

      const seen = new Set<number>()
      const reranked: KBSearchResult[] = []
      for (const idx of order) {
        if (!seen.has(idx) && candidates[idx]) {
          seen.add(idx)
          reranked.push(candidates[idx])
        }
        if (reranked.length >= topK) break
      }

      for (let i = 0; reranked.length < topK && i < candidates.length; i++) {
        if (!seen.has(i)) reranked.push(candidates[i])
      }

      this.logger.info(`Reranker: ${candidates.length} 候选 → ${reranked.length} 精排结果`)
      return reranked
    } catch (err) {
      this.logger.warn(`Reranker 失败，使用原始排序: ${(err as Error).message}`)
      return candidates.slice(0, topK)
    }
  }

  private buildContext(sources: KBSearchResult[]): string {
    return sources
      .map((s, i) => `【来源 ${i + 1}】${s.fileName}（片段 #${s.chunkIndex}，相似度 ${(s.score * 100).toFixed(1)}%）\n${s.content}`)
      .join('\n\n---\n\n')
  }
}
