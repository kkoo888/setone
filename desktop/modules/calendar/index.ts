import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { CalEvent, CalendarListParams, CalendarCreateParams, CalendarUpdateParams, CalendarDeleteParams } from './types'
import { CalendarEventRepository } from './repositories/calendar-event-repository'
import { CalendarEventService } from './services/calendar-event-service'
import { ReminderChecker } from './services/reminder-checker'

export default class CalendarModule implements Module {
  id = 'calendar'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private events: CalEvent[] = []
  private reminderTimer?: NodeJS.Timeout
  private service!: CalendarEventService
  private checker!: ReminderChecker

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    const repository = new CalendarEventRepository(context.db, context.logger)
    this.service = new CalendarEventService(repository, context.logger)
    await this.service.init()

    this.checker = new ReminderChecker(context.eventBus)
    this.events = await this.service.getAllEvents()

    // 每分钟检查提醒
    this.reminderTimer = setInterval(() => this.checker.check(this.events), 60000)
    context.logger.info('日程日历模块已激活')
  }

  async deactivate(): Promise<void> {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer)
      this.reminderTimer = undefined
    }
    this.events = []
    this.service = undefined as unknown as CalendarEventService
    this.context.logger.info('日程日历模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'calendar_list', description: '获取日程列表，可按年月筛选', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            month: { type: 'number', description: '月份（0-11）' },
            year: { type: 'number', description: '年份' }
          }, required: []
        },
        handler: {
          execute: async (p) => {
            const { month, year } = (p ?? {}) as CalendarListParams
            if (month !== undefined && year !== undefined) {
              const data = await this.service.getEventsByMonth(year, month)
              return { success: true, data }
            }
            return { success: true, data: this.events }
          }
        }
      },
      {
        type: 'tool', name: 'calendar_create', description: '创建日程事件', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            title: { type: 'string', description: '日程标题' },
            description: { type: 'string', description: '日程描述' },
            startTime: { type: 'number', description: '开始时间（时间戳毫秒）' },
            endTime: { type: 'number', description: '结束时间（时间戳毫秒）' },
            color: { type: 'string', description: '颜色标识' },
            allDay: { type: 'boolean', description: '是否全天事件' },
            reminder: { type: 'number', description: '提前提醒分钟数' }
          }, required: ['title', 'startTime', 'endTime']
        },
        handler: {
          execute: async (p) => {
            const params = p as CalendarCreateParams
            const e = await this.service.createEvent(params)
            this.events.push(e)
            return { success: true, data: e }
          }
        }
      },
      {
        type: 'tool', name: 'calendar_update', description: '更新日程事件', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '日程 ID' },
            title: { type: 'string', description: '日程标题' },
            description: { type: 'string', description: '日程描述' },
            startTime: { type: 'number', description: '开始时间（时间戳毫秒）' },
            endTime: { type: 'number', description: '结束时间（时间戳毫秒）' },
            color: { type: 'string', description: '颜色标识' },
            allDay: { type: 'boolean', description: '是否全天事件' },
            reminder: { type: 'number', description: '提前提醒分钟数' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const params = p as CalendarUpdateParams
            const updated = await this.service.updateEvent(params)
            const idx = this.events.findIndex(e => e.id === params.id)
            if (idx !== -1) this.events[idx] = updated
            this.checker.resetNotification(params.id)
            return { success: true, data: updated }
          }
        }
      },
      {
        type: 'tool', name: 'calendar_delete', description: '删除日程事件', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '日程 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as CalendarDeleteParams
            await this.service.deleteEvent(id)
            this.events = this.events.filter(e => e.id !== id)
            return { success: true }
          }
        }
      }
    ]
  }
}
