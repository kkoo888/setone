import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { SessionCreateParams, SessionIdParams, SessionRenameParams } from './types'
import { SessionRepository } from './repositories/session-repository'
import { SessionService } from './services/session-service'

export default class MultiSessionModule implements Module {
  id = 'multi-session'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private service!: SessionService

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    const repo = new SessionRepository(context.db, context.logger)
    await repo.init()
    this.service = new SessionService(repo, context.logger)
    context.logger.info('多会话管理模块已激活')
  }

  async deactivate(): Promise<void> {
    this.context.logger.info('多会话管理模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'session_list', description: '列出所有会话及当前活跃会话', priority: 10, moduleId: this.id,
        parameters: { type: 'object', properties: {}, required: [] },
        handler: {
          execute: async () => ({ success: true, data: this.service.getAll(), activeId: this.service.getActiveId() })
        }
      },
      {
        type: 'tool', name: 'session_create', description: '创建新会话', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            name: { type: 'string', description: '会话名称' },
            model: { type: 'string', description: '使用的模型标识' }
          }, required: []
        },
        handler: {
          execute: async (p) => {
            const { name, model } = (p ?? {}) as SessionCreateParams
            const s = await this.service.create(name, model)
            return { success: true, data: s }
          }
        }
      },
      {
        type: 'tool', name: 'session_switch', description: '切换到指定会话', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '会话 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as SessionIdParams
            const s = await this.service.switchTo(id)
            if (!s) return { success: false, error: '会话不存在' }
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'session_delete', description: '删除会话', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '会话 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as SessionIdParams
            const ok = await this.service.delete(id)
            if (!ok) return { success: false, error: '会话不存在' }
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'session_rename', description: '重命名会话', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '会话 ID' },
            name: { type: 'string', description: '新名称' }
          }, required: ['id', 'name']
        },
        handler: {
          execute: async (p) => {
            const { id, name } = p as SessionRenameParams
            const s = await this.service.rename(id, name)
            if (!s) return { success: false, error: '会话不存在' }
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'session_pin', description: '固定/取消固定会话', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '会话 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as SessionIdParams
            const pinned = await this.service.togglePin(id)
            if (pinned === null) return { success: false, error: '会话不存在' }
            return { success: true, data: { pinned } }
          }
        }
      }
    ]
  }
}
