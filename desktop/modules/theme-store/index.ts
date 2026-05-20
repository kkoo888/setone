import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { ThemeIdParams, ThemeImportParams, ThemeChangedEvent } from './types'
import { ThemeRepository } from './repositories/theme-repository'
import { ThemeStoreService } from './services/theme-store-service'
import { join } from 'path'

export default class ThemeStoreModule implements Module {
  id = 'theme-store'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private service!: ThemeStoreService

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    const themesDir = join(context.config.appDir, 'themes')

    // Repository → init → Service → init
    const repository = new ThemeRepository(context.db, context.logger)
    await repository.init()

    this.service = new ThemeStoreService(repository, context.config, context.logger, themesDir)
    await this.service.init()

    // 应用上次保存的主题
    try {
      const activeId = await context.config.get<string>('activeTheme')
      if (activeId) {
        const result = this.service.apply(activeId)
        if (result) {
          await context.config.set('activeTheme', activeId)
          context.eventBus.emit('theme:changed', {
            themeId: activeId,
            mode: result.mode,
            colors: result.colors
          } as ThemeChangedEvent)
        }
      }
    } catch (err) {
      context.logger.debug('恢复上次主题失败', { error: err })
    }

    context.logger.info('主题商店模块已激活')
  }

  async deactivate(): Promise<void> {
    this.service = undefined as never
    this.context.logger.info('主题商店模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'theme_list', description: '获取所有主题列表（内置 + 已导入 + 可下载）', priority: 10, moduleId: this.id,
        parameters: { type: 'object', properties: {}, required: [] },
        handler: {
          execute: async () => ({ success: true, data: this.service.getAll() })
        }
      },
      {
        type: 'tool', name: 'theme_apply', description: '应用指定主题（可下载的主题会自动导入）', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '主题 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as ThemeIdParams
            const result = this.service.apply(id)
            if (!result) return { success: false, error: '主题不存在' }
            try { await this.context.config.set('activeTheme', id) } catch { /* ignore */ }
            const event: ThemeChangedEvent = { themeId: id, mode: result.mode, colors: result.colors }
            this.context.eventBus.emit('theme:changed', event)
            return { success: true, data: result.theme }
          }
        }
      },
      {
        type: 'tool', name: 'theme_import', description: '从 JSON 文件导入主题（不传路径则弹出文件选择框）', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            path: { type: 'string', description: 'JSON 文件路径（可选）' }
          }, required: []
        },
        handler: {
          execute: async (p) => {
            const { path } = (p ?? {}) as ThemeImportParams
            const result = await this.service.importFromFile(path)
            if (!result.theme) return { success: false, error: result.error }
            return { success: true, data: result.theme }
          }
        }
      },
      {
        type: 'tool', name: 'theme_delete', description: '删除已导入的自定义主题（内置主题不可删）', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '主题 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as ThemeIdParams
            const result = await this.service.delete(id)
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
              const path = await this.service.exportToFile(id)
              if (!path) return { success: false, error: '主题不存在或已取消' }
              return { success: true, data: { path } }
            } catch (e) { return { success: false, error: (e as Error).message } }
          }
        }
      }
    ]
  }
}
