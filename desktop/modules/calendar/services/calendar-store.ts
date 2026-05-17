import type { CalEvent } from '../types'

/**
 * 日历数据库服务
 * 负责 calendar_events 表的 CRUD 操作
 */
export class CalendarStore {
  constructor(private db: { all: (sql: string, params?: unknown[]) => Promise<unknown[]>; run: (sql: string, params?: unknown[]) => Promise<unknown> }) {}

  async loadAll(): Promise<CalEvent[]> {
    try {
      const rows = await this.db.all('SELECT * FROM calendar_events ORDER BY startTime ASC')
      return rows as CalEvent[]
    } catch {
      return []
    }
  }

  async save(event: CalEvent): Promise<void> {
    try {
      await this.db.run(
        'INSERT OR REPLACE INTO calendar_events (id, title, description, startTime, endTime, color, allDay, reminder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [event.id, event.title, event.description, event.startTime, event.endTime, event.color, event.allDay ? 1 : 0, event.reminder]
      )
    } catch { /* ignore */ }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.run('DELETE FROM calendar_events WHERE id = ?', [id])
    } catch { /* ignore */ }
  }
}
