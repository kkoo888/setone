import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { FilePreviewParams } from './types'
import { FilePreviewService } from './services/file-preview-service'

export default class QuickPreviewModule implements Module {
  id = 'quick-preview'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private previewService!: FilePreviewService

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.previewService = new FilePreviewService()
    context.logger.info('快速预览模块已激活')
  }

  async deactivate(): Promise<void> {
    // 无定时器或事件监听需清理
    this.context.logger.info('快速预览模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'file_preview', description: '预览文件内容（文本/代码/图片）', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            path: { type: 'string', description: '文件绝对路径' }
          }, required: ['path']
        },
        handler: {
          execute: async (p) => {
            const { path } = p as FilePreviewParams
            if (!path) return { success: false, error: '请提供文件路径' }
            try {
              const result = await this.previewService.preview(path)
              return { success: true, data: result }
            } catch (e) { return { success: false, error: (e as Error).message } }
          }
        }
      },
      {
        type: 'tool', name: 'file_open_dialog', description: '打开文件选择对话框，返回选中路径', priority: 10, moduleId: this.id,
        parameters: { type: 'object', properties: {}, required: [] },
        handler: {
          execute: async () => {
            try {
              const path = await this.previewService.openDialog()
              if (!path) return { success: false, error: '已取消' }
              return { success: true, data: path }
            } catch (e) { return { success: false, error: (e as Error).message } }
          }
        }
      }
    ]
  }
}
