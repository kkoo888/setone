export const ReminderType = { ONCE: 'once', DAILY: 'daily', WEEKLY: 'weekly', INTERVAL: 'interval' } as const
export type ReminderTypeValue = (typeof ReminderType)[keyof typeof ReminderType]

export interface Reminder {
  id: string
  name: string
  type: ReminderTypeValue
  time: string
  message: string
  enabled: boolean
  lastTriggered?: number
  intervalMs?: number
}

export interface WeatherInfo {
  city: string
  temperature: number
  description: string
  humidity: number
  windSpeed: number
}

/** 天气预报 */
export interface WeatherForecast {
  city: string
  current: WeatherInfo
  daily: Array<{
    date: string
    maxTemp: number
    minTemp: number
    description: string
    humidity: number
    windSpeed: number
  }>
}

/** 天气提醒配置 */
export interface WeatherAlert {
  id: string
  city: string
  condition: string // e.g. 'rain', 'snow', 'high_temp', 'low_temp'
  threshold?: number // 温度阈值（可选）
  enabled: boolean
  lastTriggered?: number
}
