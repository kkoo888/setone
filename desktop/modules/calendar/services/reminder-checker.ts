import type { CalEvent } from '../types'

/**
 * 日历提醒检查器
 * 检查即将开始的日程并发送提醒
 */
export class ReminderChecker {
  constructor(private eventBus: { emit: (event: string, data: unknown) => void }) {}

  check(events: CalEvent[]): void {
    const now = Date.now()
    for (const e of events) {
      const reminderTime = e.startTime - e.reminder * 60000
      if (reminderTime <= now && e.startTime > now) {
        this.eventBus.emit('notify', { title: '日程提醒', body: `${e.title} 将在 ${e.reminder} 分钟后开始` })
      }
    }
  }
}
