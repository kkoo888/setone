import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { SnippetCreateParams, SnippetUpdateParams, SnippetIdParams } from './types'
import { SnippetStore } from './services/snippet-store'
import { clipboard } from 'electron'

export default class CodeSnippetsModule implements Module {
  id = 'code-snippets'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private store!: SnippetStore

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.store = new SnippetStore(context.db)
    await this.store.loadAll()
    context.logger.info('代码片段模块已激活')
  }

  async deactivate(): Promise<void> {
    // 无定时器或事件监听需清理，数据已持久化到 DB
    this.context.logger.info('代码片段模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'snippet_list', description: '获取所有代码片段', priority: 10, moduleId: this.id,
        parameters: { type: 'object', properties: {}, required: [] },
        handler: {
          execute: async () => ({ success: true, data: this.store.getAll() })
        }
      },
      {
        type: 'tool', name: 'snippet_create', description: '创建代码片段', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            title: { type: 'string', description: '片段标题' },
            language: { type: 'string', description: '编程语言' },
            code: { type: 'string', description: '代码内容' },
            description: { type: 'string', description: '功能描述' },
            tags: { type: 'array', items: { type: 'string' }, description: '标签列表' }
          }, required: ['title', 'language', 'code']
        },
        handler: {
          execute: async (p) => {
            const params = p as SnippetCreateParams
            const s = this.store.create(params)
            return { success: true, data: s }
          }
        }
      },
      {
        type: 'tool', name: 'snippet_update', description: '更新代码片段', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '片段 ID' },
            title: { type: 'string', description: '片段标题' },
            language: { type: 'string', description: '编程语言' },
            code: { type: 'string', description: '代码内容' },
            description: { type: 'string', description: '功能描述' },
            tags: { type: 'array', items: { type: 'string' }, description: '标签列表' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id, ...updates } = p as SnippetUpdateParams
            const s = this.store.update(id, updates)
            if (!s) return { success: false, error: '片段不存在' }
            return { success: true, data: s }
          }
        }
      },
      {
        type: 'tool', name: 'snippet_delete', description: '删除代码片段', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '片段 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as SnippetIdParams
            const ok = this.store.delete(id)
            if (!ok) return { success: false, error: '片段不存在' }
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'snippet_use', description: '使用代码片段（复制到剪贴板并计数）', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '片段 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as SnippetIdParams
            const s = this.store.incrementUsage(id)
            if (!s) return { success: false, error: '片段不存在' }
            try { clipboard.writeText(s.code) } catch { /* ignore */ }
            return { success: true, data: { code: s.code, usageCount: s.usageCount } }
          }
        }
      }
    ]
  }
}
