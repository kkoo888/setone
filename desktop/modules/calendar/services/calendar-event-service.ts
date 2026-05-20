import type { Logger } from '../../../src/main/types/logger'
import type { CalEvent, CalendarCreateParams, CalendarUpdateParams } from '../types'
import type { CalendarEventRepository } from '../repositories/calendar-event-repository'
import { randomUUID } from 'crypto'

/**
 * 日历事件业务服务
 * 封装日历事件的业务逻辑，不直接操作 SQL
 */
export class CalendarEventService {
  constructor(
    private readonly repository: CalendarEventRepository,
    private readonly logger: Logger
  ) {}

  /**
   * 初始化服务（委托 Repository 建表）
   */
  async init(): Promise<void> {
    await this.repository.init()
  }

  /**
   * 创建日历事件（含参数校验）
   * @param params 创建参数
   * @returns 新建的事件实体
   */
  async createEvent(params: CalendarCreateParams): Promise<CalEvent> {
    if (!params.title?.trim()) {
      throw new Error('日程标题不能为空')
    }
    if (params.startTime >= params.endTime) {
      throw new Error('开始时间必须早于结束时间')
    }

    const event: CalEvent = {
      id: randomUUID(),
      title: params.title.trim(),
      description: params.description?.trim() ?? '',
      startTime: params.startTime,
      endTime: params.endTime,
      color: params.color ?? '#4a9eff',
      allDay: params.allDay ?? false,
      reminder: params.reminder ?? 15,
    }

    await this.repository.save(event)
    this.logger.info(`日程已创建: ${event.title} (${event.id})`)
    return event
  }

  /**
   * 更新日历事件
   * @param params 更新参数（必须包含 id）
   * @returns 更新后的事件实体
   */
  async updateEvent(params: CalendarUpdateParams): Promise<CalEvent> {
    const existing = await this.repository.findById(params.id)
    if (!existing) {
      throw new Error(`日程不存在: ${params.id}`)
    }

    const updated: CalEvent = {
      ...existing,
      ...(params.title !== undefined && { title: params.title.trim() }),
      ...(params.description !== undefined && { description: params.description.trim() }),
      ...(params.startTime !== undefined && { startTime: params.startTime }),
      ...(params.endTime !== undefined && { endTime: params.endTime }),
      ...(params.color !== undefined && { color: params.color }),
      ...(params.allDay !== undefined && { allDay: params.allDay }),
      ...(params.reminder !== undefined && { reminder: params.reminder }),
    }

    if (updated.startTime >= updated.endTime) {
      throw new Error('开始时间必须早于结束时间')
    }

    await this.repository.save(updated)
    this.logger.info(`日程已更新: ${updated.title} (${updated.id})`)
    return updated
  }

  /**
   * 删除日历事件
   * @param id 事件 ID
   * @returns 是否成功删除
   */
  async deleteEvent(id: string): Promise<boolean> {
    const removed = await this.repository.removeById(id)
    if (removed) {
      this.logger.info(`日程已删除: ${id}`)
    }
    return removed
  }

  /**
   * 获取所有日历事件
   * @returns 事件列表
   */
  async getAllEvents(): Promise<CalEvent[]> {
    return this.repository.findAll()
  }

  /**
   * 按 ID 获取单个事件
   * @param id 事件 ID
   * @returns 事件实体，不存在时返回 undefined
   */
  async getEventById(id: string): Promise<CalEvent | undefined> {
    return this.repository.findById(id)
  }

  /**
   * 按月份筛选事件
   * @param year 年份
   * @param month 月份（0-11）
   * @returns 匹配的事件列表
   */
  async getEventsByMonth(year: number, month: number): Promise<CalEvent[]> {
    const all = await this.repository.findAll()
    const start = new Date(year, month, 1).getTime()
    const end = new Date(year, month + 1, 0, 23, 59, 59).getTime()
    return all.filter(e => e.startTime < end && e.endTime > start)
  }

  /**
   * 获取今日事件
   * @returns 今日事件列表
   */
  async getTodayEvents(): Promise<CalEvent[]> {
    const now = new Date()
    return this.getEventsByMonth(now.getFullYear(), now.getMonth())
      .then(events => {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        const todayEnd = todayStart + 86400000
        return events.filter(e => e.startTime < todayEnd && e.endTime > todayStart)
      })
  }
}
