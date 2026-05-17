import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { KBSettings, KBImportResult, KBSearchResult, KBAskResult } from './types'
import { EmbeddingService } from './services/EmbeddingService'
import { VectorStore } from './services/VectorStore'
import { KBManager } from './services/KBManager'
import { RAGEngine } from './services/RAGEngine'

/**
 * 本地知识库模块
 * 文件导入、文本切片、向量化、语义检索、RAG 问答
 */
export default class KnowledgeBaseModule implements Module {
  id = 'knowledge-base'
  meta!: import('../../src/main/types/module').ModuleMeta

  private context!: ModuleContext
  private embeddingService!: EmbeddingService
  private vectorStore!: VectorStore
  private kbManager!: KBManager
  private ragEngine!: RAGEngine
  private fileChangeHandler?: (data: unknown) => void

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    const settings = context.config as unknown as KBSettings

    // 初始化向量化服务
    this.embeddingService = new EmbeddingService(
      context.logger,
      settings.embeddingModel ?? 'nomic-embed-text'
    )

    // 初始化向量存储
    this.vectorStore = new VectorStore(context.db, context.logger)
    await this.vectorStore.init()

    // 初始化知识库管理器
    this.kbManager = new KBManager(
      context.logger,
      this.embeddingService,
      this.vectorStore,
      settings
    )

    // 初始化 RAG 引擎
    this.ragEngine = new RAGEngine(
      context.logger,
      this.embeddingService,
      this.vectorStore,
      context.ai
    )

    // 监听文件变更事件（自动重新索引）
    if (settings.autoReindex) {
      this.fileChangeHandler = async (data: unknown) => {
        const { path: filePath } = data as { path: string }
        context.logger.info(`检测到文件变更，重新索引: ${filePath}`)
        await this.kbManager.importFile(filePath)
      }
      context.eventBus.on('file:changed', this.fileChangeHandler)
    }

    context.logger.info('本地知识库模块已激活')
  }

  async deactivate(): Promise<void> {
    // 取消 eventBus 监听
    if (this.fileChangeHandler) {
      this.context.eventBus.off('file:changed', this.fileChangeHandler)
      this.fileChangeHandler = undefined
    }
    this.context.logger.info('本地知识库模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      // --- 导入文件/目录到知识库 ---
      {
        type: 'tool',
        name: 'kb_import',
        description: '导入文件/目录到知识库',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { path } = p as { path: string }
            if (!path) {
              return { success: false, error: '请提供文件或目录路径' }
            }
            try {
              const results = await this.kbManager.importPath(path)
              const successCount = results.filter(r => r.success).length
              const failCount = results.filter(r => !r.success).length
              return {
                success: true,
                data: {
                  total: results.length,
                  success: successCount,
                  failed: failCount,
                  results
                }
              }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 语义搜索知识库 ---
      {
        type: 'tool',
        name: 'kb_search',
        description: '语义搜索知识库',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { query, topK } = p as { query: string; topK?: number }
            if (!query) {
              return { success: false, error: '请提供搜索查询' }
            }
            try {
              const queryEmbedding = await this.embeddingService.embed(query)
              const results = await this.vectorStore.search(queryEmbedding, topK ?? 5)
              return { success: true, data: results }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 列出知识库文档 ---
      {
        type: 'tool',
        name: 'kb_list',
        description: '列出知识库文档',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async () => {
            try {
              const documents = await this.vectorStore.listDocuments()
              return { success: true, data: documents }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 删除文档 ---
      {
        type: 'tool',
        name: 'kb_delete',
        description: '删除文档',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { documentId } = p as { documentId: string }
            if (!documentId) {
              return { success: false, error: '请提供文档 ID' }
            }
            try {
              const deleted = await this.vectorStore.deleteDocument(documentId)
              return {
                success: deleted,
                data: deleted ? { documentId } : undefined,
                error: deleted ? undefined : '文档不存在'
              }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 基于知识库问答（RAG） ---
      {
        type: 'tool',
        name: 'kb_ask',
        description: '基于知识库问答（RAG）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { question, topK } = p as { question: string; topK?: number }
            if (!question) {
              return { success: false, error: '请提供问题' }
            }
            try {
              const result = await this.ragEngine.ask(question, topK ?? 5)
              return { success: true, data: result }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      }
    ]
  }
}
