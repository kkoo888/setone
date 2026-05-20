import type { DatabaseManager } from '../../../src/main/types/database'
import type { Logger } from '../../../src/main/types/logger'
import type { NotificationRecord } from '../types'

export class NotificationRepository {
  constructor(
    private readonly db: DatabaseManager,
    private readonly logger: Logger
  ) {}

  async init(): Promise<void> {
    await this.ensureTable()
  }

  async findById(id: string): Promise<NotificationRecord | undefined> {
    const row = await this.db.get<NotificationRecord>(
      'SELECT * FROM notifications WHERE id = ?',
      [id]
    )
    return row ? this.toEntity(row) : undefined
  }

  async findAll(limit?: number): Promise<NotificationRecord[]> {
    const rows = await this.db.query<NotificationRecord>(
      'SELECT * FROM notifications ORDER BY createdAt DESC LIMIT ?',
      [limit ?? 100]
    )
    return rows.map((r) => this.toEntity(r))
  }

  async save(notification: NotificationRecord): Promise<void> {
    await this.db.run(
      'INSERT INTO notifications (id, title, body, type, read, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [notification.id, notification.title, notification.body, notification.type, notification.read, notification.createdAt]
    )
  }

  async removeById(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM notifications WHERE id = ?', [id])
    return result.changes > 0
  }

  async markAsRead(id: string): Promise<void> {
    await this.db.run('UPDATE notifications SET read = 1 WHERE id = ?', [id])
  }

  async markAllAsRead(): Promise<void> {
    await this.db.run('UPDATE notifications SET read = 1 WHERE read = 0')
  }

  async count(): Promise<number> {
    const row = await this.db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM notifications')
    return row?.cnt ?? 0
  }

  private toEntity(row: NotificationRecord): NotificationRecord {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      type: row.type,
      read: row.read,
      createdAt: row.createdAt
    }
  }

  private async ensureTable(): Promise<void> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      type TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL
    )`)
  }
}
