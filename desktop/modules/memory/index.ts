// 补完内容：语义搜索（TF-IDF+余弦相似度）、AI 摘要（Ollama）、记忆持久化（SQLite）、自动摘要
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { MemoryManager } from './services/memory-manager'
import { Summarizer } from './services/summarizer'

export default class MemoryModule implements Module {
  id = 'memory'
  meta!: import('../../src/main/types/module').ModuleMeta
  private manager!: MemoryManager
  private summarizer!: Summarizer
  private context!: ModuleContext

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    const settings = context.config?.settings as Record<string, unknown> | undefined
    this.manager = new MemoryManager(context.logger, {
      shortTermMaxItems: settings?.shortTermMaxItems as number | undefined,
      longTermMaxItems: settings?.longTermMaxItems as number | undefined,
      autoSummarizeThreshold: settings?.autoSummarizeThreshold as number | undefined ?? 50
    })

    this.summarizer = new Summarizer(context.logger, {
      ollamaBaseUrl: settings?.ollamaBaseUrl as string | undefined,
      ollamaModel: settings?.ollamaModel as string | undefined
    })

    // 绑定数据库用于持久化
    this.manager.setDatabase(context.db)
    await this.manager.initDatabase()
    await this.manager.loadFromDatabase()

    // 设置自动摘要回调
    this.manager.setAutoSummarizeHandler(async (items) => {
      return this.summarizer.summarize(items)
    })

    context.logger.info('记忆模块已激活（语义搜索 + AI 摘要 + 持久化 + 自动摘要）')
  }

  async deactivate(): Promise<void> {
    // 清理 DB 引用
    this.manager.setDatabase(undefined as never)
    this.context.logger.info('记忆模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool',
        name: 'memory_save',
        description: '保存一条记忆（支持 short-term/long-term 类型和标签）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { content, type, tags, metadata } = p as {
              content: string
              type?: 'short-term' | 'long-term'
              tags?: string[]
              metadata?: Record<string, unknown>
            }
            return this.manager.save(content, type, tags, metadata)
          }
        }
      },
      {
        type: 'tool',
        name: 'memory_search',
        description: '搜索记忆（支持 TF-IDF 语义搜索 + 关键词精确匹配）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { query, limit } = p as { query: string; limit?: number }
            return this.manager.search(query, limit)
          }
        }
      },
      {
        type: 'tool',
        name: 'memory_delete',
        description: '删除记忆',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id } = p as { id: string }
            return { success: await this.manager.delete(id) }
          }
        }
      },
      {
        type: 'tool',
        name: 'memory_summarize',
        description: '对指定记忆列表生成 AI 摘要（调用 Ollama）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { items } = p as { items: import('./services/memory-manager').MemoryItem[] }
            return { summary: await this.summarizer.summarize(items) }
          }
        }
      }
    ]
  }
}
