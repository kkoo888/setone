import type { Module, ModuleContext, Capability } from '../../src/main/types/module'

interface NotificationRecord {
  id: string
  title: string
  body: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: number
  createdAt: number
}

/**
 * 通知管理模块
 * 系统通知的持久化存储、查询、已读/未读管理
 */
export default class NotificationsModule implements Module {
  id = 'notifications'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private notifyHandler?: (data: unknown) => void

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    // 创建表
    try {
      await context.db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT DEFAULT '',
        type TEXT DEFAULT 'info',
        read INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL
      )`)
    } catch (err) {
      context.logger.error('通知表创建失败', err as Error)
    }

    // 监听 notify 事件，自动持久化
    this.notifyHandler = async (data: unknown) => {
      const { title, body, level } = data as { title: string; body: string; level?: string }
      const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const type = (['info', 'success', 'warning', 'error'].includes(level ?? '') ? level : 'info') as NotificationRecord['type']
      try {
        await context.db.run(
          'INSERT INTO notifications (id, title, body, type, read, createdAt) VALUES (?, ?, ?, ?, 0, ?)',
          [id, title, body ?? '', type, Date.now()]
        )
      } catch { /* ignore */ }
    }
    context.eventBus.on('notify', this.notifyHandler)

    context.logger.info('通知管理模块已激活')
  }

  async deactivate(): Promise<void> {
    if (this.notifyHandler) {
      this.context.eventBus.off('notify', this.notifyHandler)
      this.notifyHandler = undefined
    }
    this.context.logger.info('通知管理模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      // 通知列表
      {
        type: 'tool', name: 'notification_list', description: '获取通知列表', priority: 10, moduleId: this.id,
        handler: {
          execute: async (params) => {
            const { limit } = (params ?? {}) as { limit?: number }
            try {
              const rows = await this.context.db.all(
                'SELECT * FROM notifications ORDER BY createdAt DESC LIMIT ?',
                [limit ?? 100]
              )
              return { success: true, data: rows }
            } catch {
              return { success: true, data: [] }
            }
          }
        }
      },

      // 标记已读
      {
        type: 'tool', name: 'notification_read', description: '标记通知已读', priority: 10, moduleId: this.id,
        handler: {
          execute: async (params) => {
            const { id } = params as { id: string }
            try {
              await this.context.db.run('UPDATE notifications SET read = 1 WHERE id = ?', [id])
              return { success: true }
            } catch { return { success: false, error: '标记失败' } }
          }
        }
      },

      // 全部已读
      {
        type: 'tool', name: 'notification_read_all', description: '标记全部通知已读', priority: 10, moduleId: this.id,
        handler: {
          execute: async () => {
            try {
              await this.context.db.run('UPDATE notifications SET read = 1 WHERE read = 0')
              return { success: true }
            } catch { return { success: false, error: '标记失败' } }
          }
        }
      },

      // 删除通知
      {
        type: 'tool', name: 'notification_delete', description: '删除通知', priority: 10, moduleId: this.id,
        handler: {
          execute: async (params) => {
            const { id } = params as { id: string }
            try {
              await this.context.db.run('DELETE FROM notifications WHERE id = ?', [id])
              return { success: true }
            } catch { return { success: false, error: '删除失败' } }
          }
        }
      }
    ]
  }
}
