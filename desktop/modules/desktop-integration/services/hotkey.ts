import { globalShortcut } from 'electron'
import type { Logger } from '../../../src/main/types/logger'
import { NotificationService } from './notification'

export interface HotkeyRegistration { accelerator: string; description: string; callback: () => void }

export class HotkeyService {
  private registrations = new Map<string, HotkeyRegistration>()
  private logger: Logger
  private notificationService: NotificationService

  constructor(logger: Logger, notificationService: NotificationService) {
    this.logger = logger
    this.notificationService = notificationService
  }

  register(accelerator: string, description: string, callback: () => void): boolean {
    if (this.registrations.has(accelerator)) {
      const existing = this.registrations.get(accelerator)!
      this.notificationService.send('快捷键冲突', { body: `快捷键 "${accelerator}" 已被占用（${existing.description}），无法绑定到 "${description}"` })
      return false
    }
    try {
      const success = globalShortcut.register(accelerator, callback)
      if (success) { this.registrations.set(accelerator, { accelerator, description, callback }); this.logger.info(`快捷键已注册: ${accelerator} → ${description}`) }
      else { this.notificationService.send('快捷键注册失败', { body: `快捷键 "${accelerator}" 注册失败，可能已被其他应用占用` }) }
      return success
    } catch (err) {
      this.notificationService.send('快捷键注册异常', { body: `快捷键 "${accelerator}" 注册异常` })
      return false
    }
  }

  unregister(accelerator: string): void { globalShortcut.unregister(accelerator); this.registrations.delete(accelerator) }
  unregisterAll(): void { globalShortcut.unregisterAll(); this.registrations.clear() }
  getRegistrations(): HotkeyRegistration[] { return Array.from(this.registrations.values()) }
}
