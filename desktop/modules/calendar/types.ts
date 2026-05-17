/** 日历事件 */
export interface CalEvent {
  id: string
  title: string
  description: string
  startTime: number
  endTime: number
  color: string
  allDay: boolean
  reminder: number
}

/** 日历列表参数 */
export interface CalendarListParams {
  month?: number
  year?: number
}

/** 日历创建参数 */
export interface CalendarCreateParams {
  title: string
  description?: string
  startTime: number
  endTime: number
  color?: string
  allDay?: boolean
  reminder?: number
}

/** 日历更新参数 */
export interface CalendarUpdateParams {
  id: string
  title?: string
  description?: string
  startTime?: number
  endTime?: number
  color?: string
  allDay?: boolean
  reminder?: number
}

/** 日历删除参数 */
export interface CalendarDeleteParams {
  id: string
}
