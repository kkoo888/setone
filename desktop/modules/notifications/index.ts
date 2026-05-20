import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { NotificationRepository } from './repositories/notification-repository'
import { NotificationService } from './services/notification-service'

/**
 * 通知管理模块
 * 系统通知的持久化存储、查询、已读/未读管理
 */
export default class NotificationsModule implements Module {
  id = 'notifications'
  meta!: import('../../src/main/types/module').ModuleMeta
  private service!: NotificationService

  async activate(context: ModuleContext): Promise<void> {
    const repo = new NotificationRepository(context.db, context.logger)
    await repo.init()

    this.service = new NotificationService(repo, context.logger, context.eventBus)
    this.service.listenEvents()

    context.logger.info('通知管理模块已激活')
  }

  async deactivate(): Promise<void> {
    this.service.unlistenEvents()
    this.service = undefined!
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'notification_list', description: '获取通知列表', priority: 10, moduleId: this.id,
        handler: {
          execute: async (params) => {
            const { limit } = (params ?? {}) as { limit?: number }
            const data = await this.service.list(limit)
            return { success: true, data }
          }
        }
      },
      {
        type: 'tool', name: 'notification_read', description: '标记通知已读', priority: 10, moduleId: this.id,
        handler: {
          execute: async (params) => {
            const { id } = params as { id: string }
            await this.service.markRead(id)
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'notification_read_all', description: '标记全部通知已读', priority: 10, moduleId: this.id,
        handler: {
          execute: async () => {
            await this.service.markAllRead()
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'notification_delete', description: '删除通知', priority: 10, moduleId: this.id,
        handler: {
          execute: async (params) => {
            const { id } = params as { id: string }
            await this.service.delete(id)
            return { success: true }
          }
        }
      }
    ]
  }
}
