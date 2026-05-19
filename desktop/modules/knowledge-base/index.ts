import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { KBSettings, KBImportResult, KBSearchResult, KBAskResult, KBNetworkStatus } from './types'
import { session } from 'electron'
import { EmbeddingService } from './services/EmbeddingService'
import { VectorStore } from './services/VectorStore'
import { KBManager } from './services/KBManager'
import { RAGEngine } from './services/RAGEngine'
import { DatasetCatalog } from './services/DatasetCatalog'
import { DatasetDownloader } from './services/DatasetDownloader'

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
  private datasetCatalog!: DatasetCatalog
  private datasetDownloader!: DatasetDownloader
  private fileChangeHandler?: (data: unknown) => void
  private networkEnabled: boolean = true

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    const settings = context.config as unknown as KBSettings

    // 读取联网开关设置（默认开启）
    this.networkEnabled = settings.networkEnabled ?? true

    // 初始化向量化服务
    this.embeddingService = new EmbeddingService(
      context.logger,
      settings.embeddingModel ?? 'nomic-embed-text'
    )
    this.embeddingService.setNetworkEnabled(this.networkEnabled)

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
    this.ragEngine.setNetworkEnabled(this.networkEnabled)

    // 初始化数据集目录
    this.datasetCatalog = new DatasetCatalog(context.logger)

    // 初始化数据集下载管理器
    this.datasetDownloader = new DatasetDownloader(context.logger, context.dataDir ?? '.')
    await this.datasetDownloader.init()

    // 注册 Electron session 下载监听（关键！没有这个 will-download 事件不会触发）
    this.datasetDownloader.setupSessionListener(session.defaultSession)

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

    // 清理下载管理器
    this.datasetDownloader.dispose()

    this.context.logger.info('本地知识库模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      // --- 联网状态查询 ---
      {
        type: 'tool',
        name: 'kb_network_status',
        description: '查看/切换知识库联网状态（控制 Embedding 向量化和 RAG AI 调用）',
        priority: 5,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              description: '设置联网开关（true=开启，false=关闭）。不传则仅查询当前状态'
            }
          }
        },
        handler: {
          execute: async (p) => {
            const { enabled } = p as { enabled?: boolean }

            // 如果传了 enabled 参数，切换状态
            if (typeof enabled === 'boolean') {
              this.networkEnabled = enabled
              this.embeddingService.setNetworkEnabled(enabled)
              this.ragEngine.setNetworkEnabled(enabled)
              this.context.logger.info(`知识库联网功能已${enabled ? '开启' : '关闭'}`)
            }

            const status: KBNetworkStatus = {
              networkEnabled: this.networkEnabled,
              networkFeatures: [
                'kb_import（导入时自动向量化）',
                'kb_search（语义搜索需要向量）',
                'kb_ask（RAG 问答需要 AI 调用）'
              ],
              localFeatures: [
                'kb_list（列出文档）',
                'kb_delete（删除文档）',
                '本地文件读取与文本切片',
                'SQLite 向量存储',
                '已有向量的余弦相似度搜索'
              ]
            }
            return { success: true, data: status }
          }
        }
      },

      // --- 导入文件/目录到知识库 ---
      {
        type: 'tool',
        name: 'kb_import',
        description: '导入文件/目录到知识库（联网开启时自动向量化，关闭时仅提取文本存储）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { path } = p as { path: string }
            if (!path) {
              return { success: false, error: '请提供文件或目录路径' }
            }
            try {
              // 联网关闭时，kb_import 仍然可以导入文件（本地操作），
              // 但 EmbeddingService 会抛错，所以需要临时跳过向量化
              // 或者直接用本地模式导入（只存储文本，不生成向量）
              const results = await this.kbManager.importPath(path)
              const successCount = results.filter(r => r.success).length
              const failCount = results.filter(r => !r.success).length

              const networkNote = this.networkEnabled
                ? ''
                : '（注意：联网已关闭，文件已导入但未向量化。开启联网后重新导入可生成向量。）'

              return {
                success: true,
                data: {
                  total: results.length,
                  success: successCount,
                  failed: failCount,
                  networkEnabled: this.networkEnabled,
                  results,
                  networkNote
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
        description: '语义搜索知识库（本地向量搜索，但联网关闭时无法为新文档生成向量）',
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
              return {
                success: true,
                data: results,
                networkEnabled: this.networkEnabled
              }
            } catch (err) {
              const errorMsg = (err as Error).message
              // 联网关闭时给出友好提示
              if (!this.networkEnabled && errorMsg.includes('联网功能已关闭')) {
                return {
                  success: false,
                  error: '语义搜索需要生成查询向量，请先开启联网功能。已有向量的文档仍可搜索。',
                  networkEnabled: false
                }
              }
              return { success: false, error: errorMsg }
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
        description: '基于知识库问答（RAG，需要联网调用 AI）',
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
              const errorMsg = (err as Error).message
              if (!this.networkEnabled && errorMsg.includes('联网功能已关闭')) {
                return {
                  success: false,
                  error: 'RAG 问答需要联网调用 AI，请先开启联网功能。',
                  networkEnabled: false
                }
              }
              return { success: false, error: errorMsg }
            }
          }
        }
      },

      // --- 数据集广场：列出数据集 ---
      {
        type: 'tool',
        name: 'kb_dataset_list',
        description: '列出数据集广场中的所有数据集（内置 + 远程加载的）',
        priority: 5,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            category: { type: 'string', description: '按分类筛选（如"百科评估"、"指令对话"等），不传则返回全部' }
          }
        },
        handler: {
          execute: async (p) => {
            const { category } = p as { category?: string }
            try {
              const datasets = this.datasetCatalog.getDatasets(category)
              const categories = this.datasetCatalog.getCategories()
              return {
                success: true,
                data: { datasets, categories, total: datasets.length }
              }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 数据集广场：从远程 Markdown 加载数据集列表 ---
      {
        type: 'tool',
        name: 'kb_dataset_fetch_remote',
        description: '从远程 Markdown 文件解析并加载数据集列表（支持 GitHub URL）',
        priority: 5,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Markdown 文件地址（GitHub blob URL 或 raw URL）' }
          },
          required: ['url']
        },
        handler: {
          execute: async (p) => {
            const { url } = p as { url: string }
            if (!url) {
              return { success: false, error: '请提供 Markdown 文件地址' }
            }
            try {
              const result = await this.datasetCatalog.fetchFromMarkdown(url)
              return {
                success: true,
                data: {
                  ...result,
                  message: `成功加载 ${result.added} 个远程数据集，当前共 ${result.total} 个数据集`
                }
              }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 数据集广场：获取下载状态 ---
      {
        type: 'tool',
        name: 'kb_dataset_download_status',
        description: '获取当前所有活跃下载的状态',
        priority: 5,
        moduleId: this.id,
        handler: {
          execute: async () => {
            try {
              const downloads = this.datasetDownloader.getActiveDownloads()
              return { success: true, data: { downloads, downloadDir: this.datasetDownloader.getDownloadDir() } }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      }
    ]
  }
}
