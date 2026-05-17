import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { readFile, stat } from 'fs/promises'

export default class QuickPreviewModule implements Module {
  id = 'quick-preview'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    context.logger.info('快速预览模块已激活')
  }

  async deactivate(): Promise<void> { this.context.logger.info('快速预览模块已停用') }

  getCapabilities(): Capability[] {
    return [
      { type: 'tool', name: 'file_preview', description: '预览文件内容', priority: 10, moduleId: this.id, handler: {
        execute: async (p) => {
          const { path } = p as { path: string }
          if (!path) return { success: false, error: '请提供文件路径' }
          try {
            const stats = await stat(path)
            if (stats.size > 10 * 1024 * 1024) return { success: false, error: '文件过大（>10MB）' }
            const ext = path.split('.').pop()?.toLowerCase() ?? ''
            const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
            if (imageExts.includes(ext)) {
              return { success: true, data: { path, content: '[图片文件]', type: 'image', size: stats.size, modified: stats.mtimeMs } }
            }
            const content = await readFile(path, 'utf-8')
            return { success: true, data: { path, content, type: 'text', size: stats.size, modified: stats.mtimeMs } }
          } catch (e) { return { success: false, error: (e as Error).message } }
        }
      }},
      { type: 'tool', name: 'file_open_dialog', description: '打开文件选择对话框', priority: 10, moduleId: this.id, handler: {
        execute: async () => {
          try {
            const { dialog } = require('electron')
            const result = await dialog.showOpenDialog({ properties: ['openFile'] })
            if (result.canceled || result.filePaths.length === 0) return { success: false, error: '已取消' }
            return { success: true, data: result.filePaths[0] }
          } catch (e) { return { success: false, error: (e as Error).message } }
        }
      }}
    ]
  }
}
