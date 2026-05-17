import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { ThemeIdParams } from './types'
import { ThemeStore } from './services/theme-store'

export default class ThemeStoreModule implements Module {
  id = 'theme-store'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private store!: ThemeStore

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.store = new ThemeStore(context.db, context.config)
    await this.store.loadInstalled()
    // 加载并应用上次保存的主题
    try {
      const activeId = await context.config.get<string>('activeTheme')
      if (activeId) {
        const t = this.store.apply(activeId)
        if (t) context.eventBus.emit('theme:changed', { themeId: activeId, colors: t.colors })
      }
    } catch { /* ignore */ }
    context.logger.info('主题商店模块已激活')
  }

  async deactivate(): Promise<void> {
    // 无定时器需清理，eventBus 由框架统一管理
    this.context.logger.info('主题商店模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'theme_list', description: '获取所有主题列表', priority: 10, moduleId: this.id,
        parameters: { type: 'object', properties: {}, required: [] },
        handler: {
          execute: async () => ({ success: true, data: this.store.getAll() })
        }
      },
      {
        type: 'tool', name: 'theme_apply', description: '应用指定主题', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '主题 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as ThemeIdParams
            const t = this.store.apply(id)
            if (!t) return { success: false, error: '主题不存在或未安装' }
            // 持久化到配置
            try { await this.context.config.set('activeTheme', id) } catch { /* ignore */ }
            this.context.eventBus.emit('theme:changed', { themeId: id, colors: t.colors })
            return { success: true, data: t }
          }
        }
      },
      {
        type: 'tool', name: 'theme_install', description: '安装主题', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '主题 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as ThemeIdParams
            const t = await this.store.install(id)
            if (!t) return { success: false, error: '主题不存在' }
            return { success: true, data: t }
          }
        }
      },
      {
        type: 'tool', name: 'theme_uninstall', description: '卸载主题（不能卸载当前使用的主题）', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '主题 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as ThemeIdParams
            const result = await this.store.uninstall(id)
            if (!result.ok) return { success: false, error: result.error }
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'theme_export', description: '导出主题为 JSON 文件', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '主题 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as ThemeIdParams
            try {
              const path = await this.store.exportToFile(id)
              if (!path) return { success: false, error: '主题不存在或已取消' }
              return { success: true, data: { path } }
            } catch (e) { return { success: false, error: (e as Error).message } }
          }
        }
      }
    ]
  }
}
