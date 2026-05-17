import type { Logger } from '../../../src/main/types/logger'

export interface WatchCallback { (path: string, event: string): void }

export class FileWatcherService {
  private watchers = new Map<string, { watcher: unknown; callback: WatchCallback; debounceTimer: NodeJS.Timeout | null }>()
  private logger: Logger
  private debounceMs: number

  constructor(logger: Logger, settings?: { debounceMs?: number }) {
    this.logger = logger
    this.debounceMs = settings?.debounceMs ?? 100
  }

  async watch(path: string, callback: WatchCallback): Promise<void> {
    if (this.watchers.has(path)) { this.logger.warn(`已在监听: ${path}`); return }
    try {
      const chokidar = await import('chokidar')
      const watcher = chokidar.watch(path, { ignoreInitial: true })
      watcher.on('all', (event: string, filePath: string) => {
        const entry = this.watchers.get(path)
        if (entry?.debounceTimer) clearTimeout(entry.debounceTimer)
        if (entry) entry.debounceTimer = setTimeout(() => callback(filePath, event), this.debounceMs)
      })
      watcher.on('error', (err: Error) => {
        this.logger.error(`文件监听错误: ${path}`, err)
        this.retryWatch(path, callback, 0)
      })
      this.watchers.set(path, { watcher, callback, debounceTimer: null })
      this.logger.info(`开始监听: ${path}`)
    } catch (e) { this.logger.error(`监听失败: ${path}`, e as Error) }
  }

  private retryWatch(path: string, callback: WatchCallback, attempt: number): void {
    if (attempt >= 3) return
    const delay = Math.pow(2, attempt) * 1000
    setTimeout(() => { this.unwatch(path); this.watch(path, callback).catch(() => {}) }, delay)
  }

  unwatch(path: string): void {
    const entry = this.watchers.get(path)
    if (!entry) return
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
    if (entry.watcher && typeof entry.watcher === 'object' && 'close' in entry.watcher) {
      (entry.watcher as { close: () => void }).close()
    }
    this.watchers.delete(path)
    this.logger.info(`停止监听: ${path}`)
  }

  unwatchAll(): void { for (const path of this.watchers.keys()) this.unwatch(path) }
}
