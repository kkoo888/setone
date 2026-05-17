// 补完内容：MouseService/KeyboardService 通过系统命令实现键鼠控制（优先 robotjs，降级 xdotool/osascript/powershell）
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { MouseService } from './services/mouse'
import { KeyboardService } from './services/keyboard'

export default class InputModule implements Module {
  id = 'input'
  meta!: import('../../src/main/types/module').ModuleMeta
  private mouse!: MouseService
  private keyboard!: KeyboardService
  private context!: ModuleContext

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.mouse = new MouseService(context.logger)
    this.keyboard = new KeyboardService(context.logger)
    context.logger.info('鼠标键盘控制模块已激活')
  }

  async deactivate(): Promise<void> { this.context.logger.info('鼠标键盘控制模块已停用') }

  getCapabilities(): Capability[] {
    return [
      { type: 'tool', name: 'mouse_move', description: '移动鼠标', priority: 10, moduleId: this.id, handler: { execute: async (p) => { const { x, y } = p as { x: number; y: number }; this.mouse.move(x, y); return { x, y } } } },
      { type: 'tool', name: 'mouse_click', description: '点击鼠标', priority: 10, moduleId: this.id, handler: { execute: async (p) => { const { x, y, button } = p as { x: number; y: number; button?: 'left' | 'right' | 'middle' }; this.mouse.click(x, y, button); return { clicked: true } } } },
      { type: 'tool', name: 'keyboard_type', description: '键盘输入', priority: 10, moduleId: this.id, handler: { execute: async (p) => { const { text } = p as { text: string }; this.keyboard.type(text); return { typed: true } } } },
      { type: 'tool', name: 'keyboard_shortcut', description: '执行快捷键', priority: 10, moduleId: this.id, handler: { execute: async (p) => { const { keys } = p as { keys: string[] }; this.keyboard.shortcut(keys); return { executed: true } } } }
    ]
  }
}
