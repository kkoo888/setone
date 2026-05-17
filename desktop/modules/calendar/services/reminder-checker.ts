import type { CalEvent } from '../types'

/**
 * 日历提醒检查器
 * 检查即将开始的日程并发送提醒
 * 使用 notifiedIds 防止同一事件重复触发通知
 */
export class ReminderChecker {
  /** 已触发通知的事件 ID 集合（key = `${eventId}_${reminderTime}` 以支持同一事件修改提醒时间后重新触发） */
  private notifiedIds = new Set<string>()

  constructor(private eventBus: { emit: (event: string, data: unknown) => void }) {}

  check(events: CalEvent[]): void {
    const now = Date.now()
    for (const e of events) {
      const reminderTime = e.startTime - e.reminder * 60000
      const notifyKey = `${e.id}_${reminderTime}`
      if (reminderTime <= now && e.startTime > now && !this.notifiedIds.has(notifyKey)) {
        this.notifiedIds.add(notifyKey)
        this.eventBus.emit('notify', { title: '日程提醒', body: `${e.title} 将在 ${e.reminder} 分钟后开始` })
      }
      // 事件已过期，清理通知标记以释放内存
      if (e.startTime <= now) {
        this.notifiedIds.delete(`${e.id}_${e.startTime - e.reminder * 60000}`)
      }
    }
  }

  /** 重置指定事件的通知标记（用于事件更新后重新触发提醒） */
  resetNotification(eventId: string): void {
    for (const key of this.notifiedIds) {
      if (key.startsWith(`${eventId}_`)) this.notifiedIds.delete(key)
    }
  }
}
