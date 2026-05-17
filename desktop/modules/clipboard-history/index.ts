import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { ClipItem } from './types'
import { ClipboardStore } from './services/clipboard-store'

export default class ClipboardHistoryModule implements Module {
  id = 'clipboard-history'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private pollTimer?: NodeJS.Timeout
  private store!: ClipboardStore

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.store = new ClipboardStore(context.db)
    await this.store.loadAll()
    // 轮询剪贴板变化（2秒间隔）
    this.pollTimer = setInterval(() => this.checkClipboard(), 2000)
    context.logger.info('剪贴板历史模块已激活')
  }

  async deactivate(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
    this.context.logger.info('剪贴板历史模块已停用')
  }

  private async checkClipboard(): Promise<void> {
    try {
      const { clipboard } = require('electron')
      const text = clipboard.readText()
      await this.store.addFromText(text)
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
            return { success: true, data: this.store.getRecent(limit ?? 200) }
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
            const item = this.store.findById(id)
            if (!item) return { success: false, error: '记录不存在' }
            const { clipboard } = require('electron')
            clipboard.writeText(item.content)
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
            const pinned = await this.store.togglePin(id)
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
            const ok = await this.store.remove(id)
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
            await this.store.clearUnpinned()
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
            const { clipboard } = require('electron')
            clipboard.writeText(content)
            return { success: true }
          }
        }
      }
    ]
  }
}
