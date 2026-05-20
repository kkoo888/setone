import type { Logger } from '../../../src/main/types/logger'
import type { ScopedEventBus } from '../../../src/main/types/event'
import type { NotificationRecord } from '../types'
import type { NotificationRepository } from '../repositories/notification-repository'

export class NotificationService {
  private notifyHandler?: (data: unknown) => void

  constructor(
    private readonly repo: NotificationRepository,
    private readonly logger: Logger,
    private readonly eventBus: ScopedEventBus
  ) {}

  /** 监听 notify 事件，自动持久化到数据库 */
  listenEvents(): void {
    this.notifyHandler = async (data: unknown) => {
      await this.createFromEvent(data)
    }
    this.eventBus.on('notify', this.notifyHandler)
  }

  /** 移除事件监听 */
  unlistenEvents(): void {
    if (this.notifyHandler) {
      this.eventBus.off('notify', this.notifyHandler)
      this.notifyHandler = undefined
    }
  }

  /** 从 notify 事件数据创建通知记录 */
  async createFromEvent(data: unknown): Promise<void> {
    const { title, body, level } = data as { title: string; body: string; level?: string }
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const type = (['info', 'success', 'warning', 'error'].includes(level ?? '') ? level : 'info') as NotificationRecord['type']
    const record: NotificationRecord = {
      id,
      title,
      body: body ?? '',
      type,
      read: 0,
      createdAt: Date.now()
    }
    await this.repo.save(record)
  }

  /** 获取通知列表 */
  async list(limit?: number): Promise<NotificationRecord[]> {
    return this.repo.findAll(limit)
  }

  /** 标记单条已读 */
  async markRead(id: string): Promise<void> {
    await this.repo.markAsRead(id)
  }

  /** 标记全部已读 */
  async markAllRead(): Promise<void> {
    await this.repo.markAllAsRead()
  }

  /** 删除通知 */
  async delete(id: string): Promise<boolean> {
    return this.repo.removeById(id)
  }
}
