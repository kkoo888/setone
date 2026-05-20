import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { SnippetCreateParams, SnippetUpdateParams, SnippetIdParams } from './types'
import { SnippetRepository } from './repositories/snippet-repository'
import { SnippetService } from './services/snippet-service'
import { clipboard } from 'electron'

export default class CodeSnippetsModule implements Module {
  id = 'code-snippets'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private service!: SnippetService

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    const repo = new SnippetRepository(context.db, context.logger)
    await repo.init()
    this.service = new SnippetService(repo, context.logger)
    context.logger.info('代码片段模块已激活')
  }

  async deactivate(): Promise<void> {
    this.context.logger.info('代码片段模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'snippet_list', description: '获取所有代码片段', priority: 10, moduleId: this.id,
        parameters: { type: 'object', properties: {}, required: [] },
        handler: {
          execute: async () => ({ success: true, data: this.service.getAll() })
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
            const s = await this.service.create(params)
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
            try {
              const s = await this.service.update(id, updates)
              return { success: true, data: s }
            } catch (e) {
              return { success: false, error: (e as Error).message }
            }
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
            try {
              await this.service.delete(id)
              return { success: true }
            } catch (e) {
              return { success: false, error: (e as Error).message }
            }
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
            try {
              const s = await this.service.incrementUsage(id)
              try { clipboard.writeText(s.code) } catch { /* ignore */ }
              return { success: true, data: { code: s.code, usageCount: s.usageCount } }
            } catch (e) {
              return { success: false, error: (e as Error).message }
            }
          }
        }
      }
    ]
  }
}
