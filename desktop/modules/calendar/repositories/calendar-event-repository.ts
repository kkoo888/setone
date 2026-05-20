import type { DatabaseManager } from '../../../src/main/types/database'
import type { Logger } from '../../../src/main/types/logger'
import type { CalEvent } from '../types'

/**
 * 日历事件数据仓库
 * 负责 calendar_events 表的所有数据库操作
 */
export class CalendarEventRepository {
  constructor(
    private readonly db: DatabaseManager,
    private readonly logger: Logger
  ) {}

  /**
   * 初始化数据库表结构
   */
  async init(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        startTime INTEGER NOT NULL,
        endTime INTEGER NOT NULL,
        color TEXT DEFAULT '#4a9eff',
        allDay INTEGER DEFAULT 0,
        reminder INTEGER DEFAULT 15
      )
    `)
    this.logger.info('calendar_events 表已初始化')
  }

  /**
   * 按 ID 查询单个日历事件
   * @param id 事件 ID
   * @returns 事件实体，不存在时返回 undefined
   */
  async findById(id: string): Promise<CalEvent | undefined> {
    const row = await this.db.get<Record<string, unknown>>(
      'SELECT * FROM calendar_events WHERE id = ?',
      [id]
    )
    return row ? this.toEntity(row) : undefined
  }

  /**
   * 查询所有日历事件（按开始时间升序）
   * @returns 事件列表
   */
  async findAll(): Promise<CalEvent[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM calendar_events ORDER BY startTime ASC'
    )
    return rows.map(row => this.toEntity(row))
  }

  /**
   * 保存（插入或更新）日历事件
   * @param event 事件实体
   */
  async save(event: CalEvent): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO calendar_events
        (id, title, description, startTime, endTime, color, allDay, reminder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.id, event.title, event.description, event.startTime, event.endTime, event.color, event.allDay ? 1 : 0, event.reminder]
    )
  }

  /**
   * 按 ID 删除日历事件
   * @param id 事件 ID
   * @returns 是否成功删除（true 表示有行被影响）
   */
  async removeById(id: string): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM calendar_events WHERE id = ?',
      [id]
    )
    return result.changes > 0
  }

  /**
   * 统计日历事件总数
   * @returns 事件数量
   */
  async count(): Promise<number> {
    const row = await this.db.get<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM calendar_events'
    )
    return row?.cnt ?? 0
  }

  /**
   * 将数据库行映射为 CalEvent 实体
   * 处理 snake_case → camelCase 转换及类型修正
   */
  private toEntity(row: Record<string, unknown>): CalEvent {
    return {
      id: row.id as string,
      title: row.title as string,
      description: (row.description as string) ?? '',
      startTime: row.startTime as number,
      endTime: row.endTime as number,
      color: (row.color as string) ?? '#4a9eff',
      allDay: Boolean(row.allDay),
      reminder: (row.reminder as number) ?? 15,
    }
  }
}
