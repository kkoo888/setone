import type { AIService, ChatMessage } from '../../../src/main/types/ai'
import type { Logger } from '../../../src/main/types/logger'
import type { KBSearchResult, KBAskResult } from '../types'
import { EmbeddingService } from './EmbeddingService'
import { VectorStore } from './VectorStore'

/** RAG 默认系统提示词 */
const DEFAULT_RAG_SYSTEM_PROMPT = `你是一个基于本地知识库的问答助手。根据提供的参考资料回答用户问题。
要求：
1. 仅基于提供的参考资料回答，不要编造信息
2. 如果参考资料中没有相关信息，明确告知用户
3. 回答时引用来源（文件名和片段编号）
4. 回答简洁准确，使用中文`

/**
 * RAG 问答引擎
 * 搜索知识库 Top-K 片段 → 拼接上下文 → AI 生成回答
 */
export class RAGEngine {
  private readonly logger: Logger
  private readonly embeddingService: EmbeddingService
  private readonly vectorStore: VectorStore
  private readonly ai: AIService

  constructor(
    logger: Logger,
    embeddingService: EmbeddingService,
    vectorStore: VectorStore,
    ai: AIService
  ) {
    this.logger = logger
    this.embeddingService = embeddingService
    this.vectorStore = vectorStore
    this.ai = ai
  }

  /**
   * 基于知识库的 RAG 问答
   * @param question - 用户问题
   * @param topK - 检索片段数量
   * @returns 回答和引用来源
   */
  async ask(question: string, topK: number = 5): Promise<KBAskResult> {
    // 1. 生成问题的嵌入向量
    const queryEmbedding = await this.embeddingService.embed(question)

    // 2. 语义搜索 Top-K 片段
    const sources = await this.vectorStore.search(queryEmbedding, topK)

    if (sources.length === 0) {
      return {
        answer: '知识库中没有找到相关信息，请先导入相关文档。',
        sources: []
      }
    }

    // 3. 拼接上下文
    const context = this.buildContext(sources)

    // 4. 调用 AI 生成回答
    const messages: ChatMessage[] = [
      { role: 'system', content: DEFAULT_RAG_SYSTEM_PROMPT },
      { role: 'user', content: `参考资料：\n${context}\n\n用户问题：${question}` }
    ]

    const response = await this.ai.chat(messages, {
      temperature: 0.3,
      maxTokens: 2000
    })

    return {
      answer: response.message.content,
      sources
    }
  }

  /**
   * 构建 RAG 上下文文本
   */
  private buildContext(sources: KBSearchResult[]): string {
    const parts: string[] = []
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]
      parts.push(`【来源 ${i + 1}】${src.fileName}（片段 #${src.chunkIndex}，相似度 ${(src.score * 100).toFixed(1)}%）\n${src.content}`)
    }
    return parts.join('\n\n---\n\n')
  }
}
