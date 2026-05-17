import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { TrayService } from './services/tray'
import { HotkeyService } from './services/hotkey'
import { NotificationService } from './services/notification'
import { AutostartService } from './services/autostart'

export default class DesktopIntegrationModule implements Module {
  id = 'desktop'
  meta!: import('../../src/main/types/module').ModuleMeta

  private tray!: TrayService
  private hotkey!: HotkeyService
  private notification!: NotificationService
  private autostart!: AutostartService
  private context!: ModuleContext

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.notification = new NotificationService(context.logger)
    this.tray = new TrayService(context.logger)
    this.hotkey = new HotkeyService(context.logger, this.notification)
    this.autostart = new AutostartService(context.logger)

    this.hotkey.register('CommandOrControl+Shift+A', '显示/隐藏助手', () => {
      context.eventBus.emit('on_toggle_window', {})
    })
    context.logger.info('桌面集成模块已激活')
  }

  async deactivate(): Promise<void> {
    this.hotkey.unregisterAll()
    this.tray.destroy()
    this.context.logger.info('桌面集成模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      { type: 'tool', name: 'notify', description: '发送系统通知', priority: 5, moduleId: this.id, handler: { execute: async (params) => { const { title, body } = params as { title: string; body: string }; this.notification.send(title, body); return { success: true } } } },
      { type: 'tool', name: 'hotkey_register', description: '注册全局快捷键', priority: 5, moduleId: this.id, handler: { execute: async (params) => { const { accelerator, description } = params as { accelerator: string; description: string }; const success = this.hotkey.register(accelerator, description, () => { this.context.eventBus.emit('on_hotkey_triggered', { accelerator }) }); return { success, accelerator } } } },
      { type: 'tool', name: 'hotkey_list', description: '获取已注册的快捷键列表', priority: 5, moduleId: this.id, handler: { execute: async () => ({ success: true, data: this.hotkey.getRegistrations() }) } },
      { type: 'tool', name: 'hotkey_unregister', description: '注销全局快捷键', priority: 5, moduleId: this.id, handler: { execute: async (params) => { const { accelerator } = params as { accelerator: string }; this.hotkey.unregister(accelerator); return { success: true } } } }
    ]
  }
}
