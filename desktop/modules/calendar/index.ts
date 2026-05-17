import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { randomUUID } from 'crypto'

interface CalEvent { id: string; title: string; description: string; startTime: number; endTime: number; color: string; allDay: boolean; reminder: number }

export default class CalendarModule implements Module {
  id = 'calendar'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private events: CalEvent[] = []
  private reminderTimer?: NodeJS.Timeout

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    try {
      const rows = await context.db.all('SELECT * FROM calendar_events ORDER BY startTime ASC')
      this.events = rows as CalEvent[]
    } catch { /* table may not exist */ }
    // 每分钟检查提醒
    this.reminderTimer = setInterval(() => this.checkReminders(), 60000)
    context.logger.info('日程日历模块已激活')
  }

  async deactivate(): Promise<void> {
    if (this.reminderTimer) { clearInterval(this.reminderTimer); this.reminderTimer = undefined }
    this.context.logger.info('日程日历模块已停用')
  }

  private checkReminders(): void {
    const now = Date.now()
    for (const e of this.events) {
      const reminderTime = e.startTime - e.reminder * 60000
      if (reminderTime <= now && e.startTime > now) {
        this.context.eventBus.emit('notify' as never, { title: '日程提醒', body: `${e.title} 将在 ${e.reminder} 分钟后开始` } as never)
      }
    }
  }

  private async saveEvent(e: CalEvent): Promise<void> {
    try { await this.context.db.run('INSERT OR REPLACE INTO calendar_events (id, title, description, startTime, endTime, color, allDay, reminder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [e.id, e.title, e.description, e.startTime, e.endTime, e.color, e.allDay ? 1 : 0, e.reminder]) } catch { /* ignore */ }
  }

  getCapabilities(): Capability[] {
    return [
      { type: 'tool', name: 'calendar_list', description: '获取日程列表', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { month, year } = (p ?? {}) as { month?: number; year?: number }; if (month !== undefined && year !== undefined) { const start = new Date(year, month, 1).getTime(); const end = new Date(year, month + 1, 0, 23, 59, 59).getTime(); return { success: true, data: this.events.filter(e => e.startTime < end && e.endTime > start) } }; return { success: true, data: this.events } }
      }},
      { type: 'tool', name: 'calendar_create', description: '创建日程', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const params = p as Omit<CalEvent, 'id'>; const e: CalEvent = { id: randomUUID(), ...params }; this.events.push(e); await this.saveEvent(e); return { success: true, data: e } }
      }},
      { type: 'tool', name: 'calendar_update', description: '更新日程', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id, ...updates } = p as Partial<CalEvent> & { id: string }; const idx = this.events.findIndex(e => e.id === id); if (idx === -1) return { success: false, error: '日程不存在' }; this.events[idx] = { ...this.events[idx], ...updates }; await this.saveEvent(this.events[idx]); return { success: true, data: this.events[idx] } }
      }},
      { type: 'tool', name: 'calendar_delete', description: '删除日程', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => { const { id } = p as { id: string }; this.events = this.events.filter(e => e.id !== id); try { await this.context.db.run('DELETE FROM calendar_events WHERE id = ?', [id]) } catch { /* ignore */ }; return { success: true } }
      }}
    ]
  }
}
