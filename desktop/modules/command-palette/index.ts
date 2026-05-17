import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { CommandEntry, RegisterCommandPayload } from './types'
import { CommandRegistry } from './services/CommandRegistry'

export default class CommandPaletteModule implements Module {
  id = 'command-palette'
  meta!: import('../../src/main/types/module').ModuleMeta
  private registry!: CommandRegistry
  private context!: ModuleContext

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.registry = new CommandRegistry({
      maxResults: (context.config.settings?.maxResults as number) ?? 20
    })

    // 注册内置命令
    this.registerBuiltinCommands()

    // 监听其他模块注册命令
    context.eventBus.on('palette:register_command', (data: { command: RegisterCommandPayload }) => {
      this.registerExternalCommand(data.command)
    })

    // 监听技能激活/停用，自动更新命令
    context.eventBus.on('on_module_loaded', (data: { moduleId: string }) => {
      if (data.moduleId === 'skill') this.syncSkillCommands()
    })

    context.logger.info('命令面板模块已激活')
  }

  async deactivate(): Promise<void> {
    this.context.logger.info('命令面板模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'palette_open', description: '打开命令面板', priority: 5, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { query } = (p ?? {}) as { query?: string }
            this.context.eventBus.emit('palette:open', { query: query ?? '' })
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'palette_close', description: '关闭命令面板', priority: 5, moduleId: this.id,
        handler: {
          execute: async () => {
            this.context.eventBus.emit('palette:close', {})
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'palette_register_command', description: '注册自定义命令', priority: 5, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const payload = p as RegisterCommandPayload
            this.registerExternalCommand(payload)
            return { success: true, id: payload.id }
          }
        }
      },
      {
        type: 'tool', name: 'palette_search', description: '搜索命令', priority: 5, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { query } = (p ?? {}) as { query?: string }
            const results = this.registry.search(query ?? '')
            return results.map(r => ({
              id: r.command.id,
              label: r.command.label,
              description: r.command.description,
              category: r.command.category,
              icon: r.command.icon,
              shortcut: r.command.shortcut,
              score: r.score
            }))
          }
        }
      },
      {
        type: 'tool', name: 'palette_list_commands', description: '列出所有命令', priority: 5, moduleId: this.id,
        handler: {
          execute: async () => {
            return this.registry.getAll().map(c => ({
              id: c.id,
              label: c.label,
              description: c.description,
              category: c.category,
              icon: c.icon
            }))
          }
        }
      },
      {
        type: 'tool', name: 'palette_execute', description: '执行命令', priority: 5, moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { commandId } = p as { commandId: string }
            return this.executeCommand(commandId)
          }
        }
      }
    ]
  }

  /** 注册内置命令 */
  private registerBuiltinCommands(): void {
    const builtins: CommandEntry[] = [
      // 导航
      {
        id: 'nav:chat', label: '打开聊天', description: '切换到聊天页面',
        keywords: ['聊天', 'chat', '对话'], category: 'navigation', icon: '💬', shortcut: 'Ctrl+1',
        action: { type: 'navigate', page: 'chat' }, useCount: 0
      },
      {
        id: 'nav:skills', label: '打开技能', description: '切换到技能管理页面',
        keywords: ['技能', 'skill', '管理'], category: 'navigation', icon: '⚡', shortcut: 'Ctrl+2',
        action: { type: 'navigate', page: 'skills' }, useCount: 0
      },
      {
        id: 'nav:modules', label: '打开模块', description: '切换到模块管理页面',
        keywords: ['模块', 'module', '管理'], category: 'navigation', icon: '🧩', shortcut: 'Ctrl+3',
        action: { type: 'navigate', page: 'modules' }, useCount: 0
      },
      {
        id: 'nav:settings', label: '打开设置', description: '切换到设置页面',
        keywords: ['设置', 'settings', '配置'], category: 'navigation', icon: '⚙️', shortcut: 'Ctrl+,',
        action: { type: 'navigate', page: 'settings' }, useCount: 0
      },
      {
        id: 'nav:live2d', label: '打开 Live2D', description: '切换到 Live2D 形象页面',
        keywords: ['live2d', '形象', '模型'], category: 'navigation', icon: '🎭',
        action: { type: 'navigate', page: 'live2d' }, useCount: 0
      },

      // 聊天
      {
        id: 'chat:clear', label: '清空聊天', description: '清除当前聊天记录',
        keywords: ['清空', 'clear', '清除', '聊天'], category: 'chat', icon: '🗑️',
        action: { type: 'emit', eventName: 'chat:clear', eventData: {} }, useCount: 0
      },

      // 主题
      {
        id: 'theme:toggle', label: '切换主题', description: '在亮色/暗色主题间切换',
        keywords: ['主题', 'theme', '暗色', '亮色', '深色', '浅色'], category: 'setting', icon: '🎨',
        action: { type: 'emit', eventName: 'theme:toggle', eventData: {} }, useCount: 0
      },

      // 模块管理
      {
        id: 'module:reload', label: '重新加载模块', description: '重新扫描并加载所有模块',
        keywords: ['重载', 'reload', '模块', '刷新'], category: 'module', icon: '🔄',
        action: { type: 'emit', eventName: 'module:reload', eventData: {} }, useCount: 0
      }
    ]

    this.registry.registerAll(builtins)
  }

  /** 注册外部命令（来自其他模块） */
  private registerExternalCommand(payload: RegisterCommandPayload): void {
    const entry: CommandEntry = {
      id: payload.id,
      label: payload.label,
      description: payload.description,
      keywords: payload.keywords ?? [payload.label],
      category: payload.category ?? 'custom',
      icon: payload.icon,
      shortcut: payload.shortcut,
      action: payload.action,
      useCount: 0
    }
    this.registry.register(entry)
    this.context.logger.info(`外部命令已注册: ${entry.label}`)
  }

  /** 同步技能模块的技能为命令 */
  private syncSkillCommands(): void {
    const skillModule = this.context.getModule('skill')
    if (!skillModule) return

    // 技能模块激活后，通过事件获取技能列表
    this.context.eventBus.emit('skill:list', {})
    this.context.logger.info('已请求同步技能命令')
  }

  /** 执行命令 */
  private async executeCommand(commandId: string): Promise<{ success: boolean; error?: string }> {
    const cmd = this.registry.get(commandId)
    if (!cmd) return { success: false, error: `命令 "${commandId}" 不存在` }

    this.registry.recordUsage(commandId)

    try {
      switch (cmd.action.type) {
        case 'navigate':
          this.context.eventBus.emit('navigate', { page: cmd.action.page })
          break
        case 'emit':
          this.context.eventBus.emit(cmd.action.eventName!, cmd.action.eventData)
          break
        case 'capability':
          this.context.eventBus.emit('tool:execute', {
            moduleId: cmd.action.moduleId,
            capability: cmd.action.capabilityName,
            params: cmd.action.params
          })
          break
      }
      this.context.eventBus.emit('palette:executed', { commandId })
      this.context.eventBus.emit('palette:close', {})
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
}
