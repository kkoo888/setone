import type { Logger } from '../../src/main/types/logger'
import type { Reminder } from './types'

export class ReminderService {
  private reminders = new Map<string, Reminder>()
  private timers = new Map<string, NodeJS.Timeout>()
  private logger: Logger
  private onTrigger: ((reminder: Reminder) => void) | null = null

  constructor(logger: Logger) { this.logger = logger }

  setTriggerCallback(callback: (reminder: Reminder) => void): void { this.onTrigger = callback }

  add(reminder: Reminder): void {
    this.reminders.set(reminder.id, reminder)
    if (reminder.enabled) this.schedule(reminder)
    this.logger.info(`提醒已添加: ${reminder.name}`)
  }

  remove(id: string): void {
    const timer = this.timers.get(id)
    if (timer) clearTimeout(timer)
    this.timers.delete(id)
    this.reminders.delete(id)
  }

  private schedule(reminder: Reminder): void {
    const now = Date.now()
    let delay = 60000 // 默认1分钟后
    if (reminder.type === 'interval' && reminder.intervalMs) delay = reminder.intervalMs
    else if (reminder.time) {
      const target = new Date(reminder.time).getTime()
      delay = Math.max(0, target - now)
    }
    const timer = setTimeout(() => {
      this.logger.info(`提醒触发: ${reminder.name}`)
      this.onTrigger?.(reminder)
      reminder.lastTriggered = Date.now()
      if (reminder.type === 'interval') this.schedule(reminder)
    }, delay)
    this.timers.set(reminder.id, timer)
  }

  list(): Reminder[] { return Array.from(this.reminders.values()) }
  toggle(id: string): boolean {
    const r = this.reminders.get(id)
    if (!r) return false
    r.enabled = !r.enabled
    if (r.enabled) this.schedule(r)
    else { const t = this.timers.get(id); if (t) clearTimeout(t); this.timers.delete(id) }
    return r.enabled
  }
}
