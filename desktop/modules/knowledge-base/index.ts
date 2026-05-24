import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { KBSettings, KBImportResult, KBSearchResult, KBAskResult, KBNetworkStatus } from './types'
import { join, resolve, isAbsolute } from 'path'
import { session } from 'electron'
import { VectorStore } from './services/VectorStore'
import { KBManager } from './services/KBManager'
import { RAGEngine } from './services/RAGEngine'
import { DatasetCatalog } from './services/DatasetCatalog'
import { DatasetDownloader } from './services/DatasetDownloader'
import { VectraStore } from './services/VectraStore'
import { DocumentRepository } from './repositories/document-repository'

/**
 * 本地知识库模块
 * 文件导入 → Vectra（自动切片+嵌入+BM25索引）→ 混合检索 → LLM Reranker → RAG 问答
 */
export default class KnowledgeBaseModule implements Module {
  id = 'knowledge-base'
  meta!: import('../../src/main/types/module').ModuleMeta

  private context!: ModuleContext
  private vectorStore!: VectorStore
  private kbManager!: KBManager
  private ragEngine!: RAGEngine
  private datasetCatalog!: DatasetCatalog
  private datasetDownloader!: DatasetDownloader
  private fileChangeHandler?: (data: unknown) => void
  private networkEnabled: boolean = true
  private rawDir: string = ''
  private indexDir: string = ''

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    const defaults = this.meta.settings
    const userEmbeddingModel = await context.config.get<string>('ollama.embeddingModel')
    const settings: KBSettings = {
      chunkSize: (defaults.chunkSize as number) ?? 512,
      chunkOverlap: (defaults.chunkOverlap as number) ?? 64,
      embeddingModel: userEmbeddingModel || (defaults.embeddingModel as string) || 'nomic-embed-text',
      maxDocuments: (defaults.maxDocuments as number) ?? 1000,
      supportedFormats: (defaults.supportedFormats as string[]) ?? ['.md', '.txt', '.pdf'],
      autoReindex: (defaults.autoReindex as boolean) ?? true,
      networkEnabled: (defaults.networkEnabled as boolean) ?? true,
      tempDir: context.dataDir ?? '.',
    }

    this.networkEnabled = settings.networkEnabled ?? true

    // 解析原始文件目录和索引目录：优先从数据库读，fallback 到 module.json 默认值
    const dataDir = context.dataDir ?? '.'
    const rawDirSetting = (await context.store.getPersist<string>('rawDir')) ?? (defaults.rawDir as string) ?? ''
    const indexDirSetting = (await context.store.getPersist<string>('indexDir')) ?? (defaults.indexDir as string) ?? ''
    const rawDir = rawDirSetting
      ? (isAbsolute(rawDirSetting) ? rawDirSetting : resolve(dataDir, rawDirSetting))
      : join(dataDir, 'datasets')
    const indexDir = indexDirSetting
      ? (isAbsolute(indexDirSetting) ? indexDirSetting : resolve(dataDir, indexDirSetting))
      : join(dataDir, 'vectra-doc-index')
    this.rawDir = rawDir
    this.indexDir = indexDir
    context.logger.info(`原始文件目录: ${rawDir}`)
    context.logger.info(`索引目录: ${indexDir}`)

    // Vectra 存储层（官方 LocalDocumentIndex + OpenAIEmbeddings 兼容 Ollama）
    const ollamaEndpoint = await context.config.get<string>('ollama.endpoint') || 'http://localhost:11434'
    const docRepo = new DocumentRepository(context.db)
    const vectraStore = new VectraStore(
      indexDir,
      context.logger,
      ollamaEndpoint,
      settings.embeddingModel ?? 'nomic-embed-text',
      settings.chunkSize ?? 512,
      settings.chunkOverlap ?? 64
    )
    this.vectorStore = new VectorStore(docRepo, vectraStore, context.logger)
    await this.vectorStore.init()

    // 知识库管理器（文本提取 → Vectra 自动切片+嵌入）
    this.kbManager = new KBManager(
      context.logger,
      this.vectorStore,
      settings,
      this.networkEnabled
    )

    // RAG 引擎（混合检索 → LLM Reranker → AI 回答）
    this.ragEngine = new RAGEngine(context.logger, this.vectorStore, context.ai)
    this.ragEngine.setNetworkEnabled(this.networkEnabled)

    // 数据集广场
    this.datasetCatalog = new DatasetCatalog(context.logger)
    this.datasetDownloader = new DatasetDownloader(context.logger, rawDir)
    await this.datasetDownloader.init()
    this.datasetDownloader.setupSessionListener(session.defaultSession)

    // 下载完成 → 自动导入知识库（带数据集来源信息）
    this.datasetDownloader.setOnDownloadComplete(async (datasetId, datasetName, filePath) => {
      context.logger.info(`数据集下载完成，自动导入知识库: ${datasetName}`)
      try {
        const result = await this.kbManager.importFile(filePath, datasetId, datasetName)
        if (result.success) {
          context.logger.info(`数据集 "${datasetName}" 已自动导入知识库，${result.chunkCount} 个片段`)
        } else {
          context.logger.warn(`数据集 "${datasetName}" 自动导入失败: ${result.error}`)
        }
      } catch (err) {
        context.logger.error(`数据集 "${datasetName}" 自动导入异常: ${(err as Error).message}`)
      }
    })

    // 文件变更自动重新索引
    if (settings.autoReindex) {
      this.fileChangeHandler = async (data: unknown) => {
        const { path: filePath } = data as { path: string }
        context.logger.info(`检测到文件变更，重新索引: ${filePath}`)
        await this.kbManager.importFile(filePath)
      }
      context.eventBus.on('file:changed', this.fileChangeHandler)
    }

    context.logger.info('本地知识库模块已激活（Vectra 混合检索 + LLM Reranker）')
  }

  async deactivate(): Promise<void> {
    if (this.fileChangeHandler) {
      this.context.eventBus.off('file:changed', this.fileChangeHandler)
      this.fileChangeHandler = undefined
    }
    this.datasetDownloader.dispose()
    this.context.logger.info('本地知识库模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      // --- 联网状态查询 ---
      {
        type: 'tool',
        name: 'kb_network_status',
        description: '查看/切换知识库联网状态',
        priority: 5,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', description: '设置联网开关（true=开启，false=关闭）。不传则仅查询当前状态' }
          }
        },
        handler: {
          execute: async (p) => {
            const { enabled } = p as { enabled?: boolean }
            if (typeof enabled === 'boolean') {
              this.networkEnabled = enabled
              this.ragEngine.setNetworkEnabled(enabled)
              this.context.logger.info(`知识库联网功能已${enabled ? '开启' : '关闭'}`)
            }
            const status: KBNetworkStatus = {
              networkEnabled: this.networkEnabled,
              rawDir: this.rawDir,
              indexDir: this.indexDir,
              networkFeatures: ['kb_import（导入时自动向量化+BM25索引）', 'kb_search（混合检索）', 'kb_ask（RAG 问答）'],
              localFeatures: ['kb_list（列出文档）', 'kb_delete（删除文档）', '本地文件读取']
            }
            return { success: true, data: status }
          }
        }
      },

      // --- 导入文件/目录 ---
      {
        type: 'tool',
        name: 'kb_import',
        description: '导入文件/目录到知识库（自动切片+嵌入+BM25索引）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { path } = p as { path: string }
            if (!path) return { success: false, error: '请提供文件或目录路径' }
            try {
              const results = await this.kbManager.importPath(path)
              const successCount = results.filter(r => r.success).length
              return {
                success: true,
                data: {
                  total: results.length, success: successCount, failed: results.length - successCount,
                  networkEnabled: this.networkEnabled, results
                }
              }
            } catch (err) { return { success: false, error: (err as Error).message } }
          }
        }
      },

      // --- 混合检索（向量 + BM25） ---
      {
        type: 'tool',
        name: 'kb_search',
        description: '语义搜索知识库（默认混合检索：向量+BM25，Vectra 官方实现）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { query, topK } = p as { query: string; topK?: number }
            if (!query) return { success: false, error: '请提供搜索查询' }
            try {
              // Vectra 内部自动嵌入查询 + BM25 混合搜索
              const results = await this.vectorStore.searchHybrid(query, topK ?? 5)
              return { success: true, data: results, meta: { mode: 'hybrid', count: results.length } }
            } catch (err) {
              const errorMsg = (err as Error).message
              if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch')) {
                return { success: false, error: `搜索失败：无法连接 Ollama 嵌入服务，请确认 Ollama 正在运行（${errorMsg}）` }
              }
              return { success: false, error: errorMsg }
            }
          }
        }
      },

      // --- 列出文档 ---
      {
        type: 'tool',
        name: 'kb_list',
        description: '列出知识库文档',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async () => {
            try { return { success: true, data: await this.vectorStore.listDocuments() } }
            catch (err) { return { success: false, error: (err as Error).message } }
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
            if (!documentId) return { success: false, error: '请提供文档 ID' }
            try {
              const deleted = await this.vectorStore.deleteDocument(documentId)
              return { success: deleted, data: deleted ? { documentId } : undefined, error: deleted ? undefined : '文档不存在' }
            } catch (err) { return { success: false, error: (err as Error).message } }
          }
        }
      },

      // --- 重建索引 ---
      {
        type: 'tool',
        name: 'kb_reindex',
        description: '重建知识库索引（用当前模型重新向量化所有文档）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async () => {
            if (!this.networkEnabled) return { success: false, error: '重建索引需要联网，请先开启。' }
            try {
              const documents = await this.vectorStore.listDocuments()
              if (documents.length === 0) return { success: true, data: { message: '知识库为空', reindexed: 0 } }

              let reindexed = 0
              const errors: string[] = []
              for (const doc of documents) {
                try {
                  await this.vectorStore.deleteDocument(doc.id)
                  const result = await this.kbManager.importFile(doc.filePath)
                  if (result.success) reindexed++
                  else errors.push(`${doc.fileName}: ${result.error}`)
                } catch (err) { errors.push(`${doc.fileName}: ${(err as Error).message}`) }
              }
              return { success: true, data: { total: documents.length, reindexed, failed: documents.length - reindexed, errors: errors.length > 0 ? errors : undefined } }
            } catch (err) { return { success: false, error: (err as Error).message } }
          }
        }
      },

      // --- RAG 问答 ---
      {
        type: 'tool',
        name: 'kb_ask',
        description: '基于知识库问答（混合检索 → LLM Reranker → AI 回答）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { question, topK } = p as { question: string; topK?: number }
            if (!question) return { success: false, error: '请提供问题' }
            try {
              const result = await this.ragEngine.ask(question, topK ?? 5)
              return { success: true, data: result }
            } catch (err) {
              const errorMsg = (err as Error).message
              if (!this.networkEnabled && errorMsg.includes('联网功能已关闭')) {
                return { success: false, error: 'RAG 问答需要联网，请先开启。', networkEnabled: false }
              }
              return { success: false, error: errorMsg }
            }
          }
        }
      },

      // --- 数据集广场 ---
      {
        type: 'tool', name: 'kb_dataset_list', description: '列出数据集广场中的所有数据集', priority: 5, moduleId: this.id,
        parameters: { type: 'object', properties: { category: { type: 'string', description: '按分类筛选' } } },
        handler: {
          execute: async (p) => {
            const { category } = p as { category?: string }
            try {
              const datasets = this.datasetCatalog.getDatasets(category)
              return { success: true, data: { datasets, categories: this.datasetCatalog.getCategories(), total: datasets.length } }
            } catch (err) { return { success: false, error: (err as Error).message } }
          }
        }
      },
      {
        type: 'tool', name: 'kb_dataset_fetch_remote', description: '从远程 Markdown 加载数据集列表', priority: 5, moduleId: this.id,
        parameters: { type: 'object', properties: { url: { type: 'string', description: 'Markdown 文件地址' } }, required: ['url'] },
        handler: {
          execute: async (p) => {
            const { url } = p as { url: string }
            if (!url) return { success: false, error: '请提供地址' }
            try {
              const result = await this.datasetCatalog.fetchFromMarkdown(url)
              return { success: true, data: { ...result, message: `加载 ${result.added} 个远程数据集，当前共 ${result.total} 个` } }
            } catch (err) { return { success: false, error: (err as Error).message } }
          }
        }
      },
      {
        type: 'tool', name: 'kb_dataset_download_status', description: '获取下载状态', priority: 5, moduleId: this.id,
        handler: {
          execute: async () => {
            try { return { success: true, data: { downloads: this.datasetDownloader.getActiveDownloads(), downloadDir: this.datasetDownloader.getDownloadDir() } } }
            catch (err) { return { success: false, error: (err as Error).message } }
          }
        }
      }
    ]
  }
}
