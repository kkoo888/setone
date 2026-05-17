import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { FileReaderService } from './services/file-reader'
import { FileWriterService } from './services/file-writer'
import { FileWatcherService } from './services/file-watcher'

export default class FileModule implements Module {
  id = 'file'
  meta!: import('../../src/main/types/module').ModuleMeta
  private reader!: FileReaderService
  private writer!: FileWriterService
  private watcher!: FileWatcherService
  private context!: ModuleContext

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    const settings = context.config?.settings
    this.reader = new FileReaderService(context.logger, settings)
    this.writer = new FileWriterService(context.logger, settings)
    this.watcher = new FileWatcherService(context.logger)
    context.logger.info('文件操作模块已激活')
  }

  async deactivate(): Promise<void> { this.watcher.unwatchAll(); this.context.logger.info('文件操作模块已停用') }

  getCapabilities(): Capability[] {
    return [
      { type: 'tool', name: 'file_read', description: '读取文件内容', priority: 10, moduleId: this.id, handler: { execute: async (p) => { const { path } = p as { path: string }; return this.reader.read(path) } } },
      { type: 'tool', name: 'file_write', description: '写入文件内容', priority: 10, moduleId: this.id, handler: { execute: async (p) => { const { path, content } = p as { path: string; content: string }; return this.writer.write(path, content) } } },
      { type: 'tool', name: 'file_list', description: '列出目录文件', priority: 10, moduleId: this.id, handler: { execute: async (p) => { const { path } = p as { path: string }; const { readdir } = await import('fs/promises'); return readdir(path) } } },
      { type: 'tool', name: 'file_watch', description: '监听文件变化', priority: 10, moduleId: this.id, handler: { execute: async (p) => { const { path } = p as { path: string }; await this.watcher.watch(path, (fp, event) => { context.eventBus.emit('file:changed', { path: fp, event }) }); return { watching: true, path } } } }
    ]
  }
}
