// 补完内容：接入 wttr.in 天气 API，实现 WeatherService、weather_check/forecast/alert 工具
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { ReminderService } from './ReminderService'
import { WeatherService } from './services/weather-service'
import type { Reminder, WeatherAlert } from './types'

export default class ProactiveModule implements Module {
  id = 'proactive'
  meta!: import('../../src/main/types/module').ModuleMeta
  private reminderService!: ReminderService
  private weatherService!: WeatherService
  private context!: ModuleContext
  /** 天气提醒列表 */
  private weatherAlerts = new Map<string, WeatherAlert>()
  private weatherAlertTimers = new Map<string, NodeJS.Timeout>()

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.reminderService = new ReminderService(context.logger)
    this.weatherService = new WeatherService(context.logger)
    this.reminderService.setTriggerCallback((reminder) => {
      context.eventBus.emit('reminder:trigger', { id: reminder.id, name: reminder.name, message: reminder.message })
    })
    context.logger.info('主动关怀模块已激活')
  }

  async deactivate(): Promise<void> {
    // 清理天气提醒定时器
    for (const timer of this.weatherAlertTimers.values()) {
      clearInterval(timer)
    }
    this.weatherAlertTimers.clear()
    this.weatherAlerts.clear()
    this.context.logger.info('主动关怀模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      // ========== 提醒相关 ==========
      {
        type: 'tool', name: 'reminder_add', description: '添加提醒', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const r = p as Reminder
            r.id = r.id ?? crypto.randomUUID()
            this.reminderService.add(r)
            return { id: r.id, added: true }
          },
        },
      },
      {
        type: 'tool', name: 'reminder_list', description: '列出提醒', priority: 10, moduleId: this.id,
        handler: { execute: async () => this.reminderService.list() },
      },
      {
        type: 'tool', name: 'reminder_toggle', description: '切换提醒状态', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id } = p as { id: string }
            return { enabled: this.reminderService.toggle(id) }
          },
        },
      },

      // ========== 天气相关 ==========
      {
        type: 'tool', name: 'weather_check', description: '查询当前天气', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { city } = p as { city: string }
            if (!city) return { error: '请提供城市名称' }
            try {
              const weather = await this.weatherService.getWeather(city)
              return weather
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              this.context.logger.error(`天气查询失败: ${msg}`)
              return { error: `天气查询失败: ${msg}` }
            }
          },
        },
      },
      {
        type: 'tool', name: 'weather_forecast', description: '获取未来几天天气预报', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { city, days } = p as { city: string; days?: number }
            if (!city) return { error: '请提供城市名称' }
            try {
              const forecast = await this.weatherService.getForecast(city, days)
              return forecast
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              this.context.logger.error(`天气预报查询失败: ${msg}`)
              return { error: `天气预报查询失败: ${msg}` }
            }
          },
        },
      },
      {
        type: 'tool', name: 'weather_alert', description: '设置天气提醒（如下雨、高温等）', priority: 10, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { city, condition, threshold, enabled = true } = p as {
              city: string
              condition: string
              threshold?: number
              enabled?: boolean
            }
            if (!city || !condition) return { error: '请提供城市名称和提醒条件' }

            const id = crypto.randomUUID()
            const alert: WeatherAlert = { id, city, condition, threshold, enabled }
            this.weatherAlerts.set(id, alert)

            if (enabled) {
              this.startWeatherAlertCheck(alert)
            }

            this.context.logger.info(`天气提醒已设置: ${city} - ${condition}`)
            return { id, city, condition, enabled }
          },
        },
      },
    ]
  }

  /**
   * 启动天气提醒定期检查
   * 每 30 分钟检查一次天气是否满足提醒条件
   */
  private startWeatherAlertCheck(alert: WeatherAlert): void {
    const check = async () => {
      try {
        const weather = await this.weatherService.getWeather(alert.city)
        let triggered = false

        switch (alert.condition) {
          case 'rain':
            triggered = /雨|rain/i.test(weather.description)
            break
          case 'snow':
            triggered = /雪|snow/i.test(weather.description)
            break
          case 'high_temp':
            triggered = alert.threshold !== undefined && weather.temperature >= alert.threshold
            break
          case 'low_temp':
            triggered = alert.threshold !== undefined && weather.temperature <= alert.threshold
            break
          default:
            triggered = weather.description.includes(alert.condition)
        }

        if (triggered && (!alert.lastTriggered || Date.now() - alert.lastTriggered > 3600000)) {
          alert.lastTriggered = Date.now()
          this.context.eventBus.emit('weather:alert', {
            id: alert.id,
            city: alert.city,
            condition: alert.condition,
            weather,
          })
          this.context.logger.info(`天气提醒触发: ${alert.city} - ${alert.condition}`)
        }
      } catch (e) {
        this.context.logger.warn(`天气提醒检查失败: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // 立即检查一次
    check()
    // 每 30 分钟检查一次
    const timer = setInterval(check, 30 * 60 * 1000)
    this.weatherAlertTimers.set(alert.id, timer)
  }
}
