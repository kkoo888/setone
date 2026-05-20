import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { ClipboardRepository } from './repositories/clipboard-repository'
import { ClipboardService } from './services/clipboard-service'
import { clipboard } from 'electron'

export default class ClipboardHistoryModule implements Module {
  id = 'clipboard-history'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private pollTimer?: NodeJS.Timeout
  private repository!: ClipboardRepository
  private service!: ClipboardService
  /** 缓存 electron clipboard 引用，避免每次 require */
  private clipboardRef: { readText: () => string; writeText: (text: string) => void } | null = null

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    // Repository → init → Service
    this.repository = new ClipboardRepository(context.db, context.logger)
    await this.repository.init()
    this.service = new ClipboardService(this.repository)

    // 缓存 electron clipboard 引用
    try {
      this.clipboardRef = clipboard
    } catch { /* 非 Electron 环境 */ }
    // 轮询剪贴板变化（5秒间隔，平衡响应性与 CPU/电量消耗）
    this.pollTimer = setInterval(() => this.checkClipboard(), 5000)
    context.logger.info('剪贴板历史模块已激活')
  }

  async deactivate(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
    this.clipboardRef = null
    this.context.logger.info('剪贴板历史模块已停用')
  }

  private async checkClipboard(): Promise<void> {
    try {
      if (!this.clipboardRef) return
      const text = this.clipboardRef.readText()
      await this.service.addFromText(text)
    } catch { /* ignore */ }
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'clipboard_list', description: '获取剪贴板历史记录', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            limit: { type: 'number', description: '返回记录数量上限', default: 200 }
          }, required: []
        },
        handler: {
          execute: async (p) => {
            const { limit } = (p ?? {}) as { limit?: number }
            return { success: true, data: this.service.getRecent(limit ?? 200) }
          }
        }
      },
      {
        type: 'tool', name: 'clipboard_copy', description: '将历史记录复制到剪贴板', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '记录 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as { id: string }
            const item = await this.service.findById(id)
            if (!item) return { success: false, error: '记录不存在' }
            if (this.clipboardRef) {
              this.service.writeToClipboard(item.content, this.clipboardRef)
            }
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'clipboard_pin', description: '固定/取消固定剪贴板记录', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '记录 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as { id: string }
            const pinned = await this.service.togglePin(id)
            if (pinned === null) return { success: false, error: '记录不存在' }
            return { success: true, data: { pinned } }
          }
        }
      },
      {
        type: 'tool', name: 'clipboard_delete', description: '删除剪贴板记录', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            id: { type: 'string', description: '记录 ID' }
          }, required: ['id']
        },
        handler: {
          execute: async (p) => {
            const { id } = p as { id: string }
            const ok = await this.service.remove(id)
            if (!ok) return { success: false, error: '记录不存在' }
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'clipboard_clear', description: '清空未固定的剪贴板历史', priority: 10, moduleId: this.id,
        parameters: { type: 'object', properties: {}, required: [] },
        handler: {
          execute: async () => {
            await this.service.clearUnpinned()
            return { success: true }
          }
        }
      },
      {
        type: 'tool', name: 'clipboard_write', description: '写入文本到剪贴板', priority: 10, moduleId: this.id,
        parameters: {
          type: 'object', properties: {
            content: { type: 'string', description: '要写入的文本内容' }
          }, required: ['content']
        },
        handler: {
          execute: async (p) => {
            const { content } = p as { content: string }
            if (this.clipboardRef) {
              this.service.writeToClipboard(content, this.clipboardRef)
            }
            return { success: true }
          }
        }
      }
    ]
  }
}
