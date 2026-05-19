import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import type { Logger } from '../../../src/main/types/logger'

/** ModelScope API 基础地址 */
const MODELSCOPE_API = 'https://modelscope.cn/api/v1'

/** 下载状态 */
export type DownloadState = 'pending' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'interrupted'

/** 下载进度信息 */
export interface DownloadProgress {
  datasetId: string
  datasetName: string
  state: DownloadState
  receivedBytes: number
  totalBytes: number
  percent: number
  savePath: string
}

/** 活跃下载记录 */
interface ActiveDownload {
  item: Electron.DownloadItem
  datasetId: string
  datasetName: string
  state: DownloadState
}

/**
 * 数据集下载管理器
 * 使用 Electron 原生下载能力，支持暂停/恢复/取消
 */
export class DatasetDownloader {
  private readonly logger: Logger
  private readonly downloadDir: string
  private activeDownloads = new Map<string, ActiveDownload>()
  private readonly ipcCleanups: Array<() => void> = []
  private sessionCleanup?: () => void

  constructor(logger: Logger, dataDir: string) {
    this.logger = logger
    this.downloadDir = join(dataDir, 'datasets')
  }

  /**
   * 初始化：注册 IPC 处理器和 Electron 下载监听
   */
  async init(): Promise<void> {
    // 确保下载目录存在
    if (!existsSync(this.downloadDir)) {
      await mkdir(this.downloadDir, { recursive: true })
    }

    // 注册 IPC 处理器
    this.registerIpcHandlers()

    this.logger.info(`数据集下载管理器已初始化，下载目录: ${this.downloadDir}`)
  }

  /**
   * 注册 IPC 处理器
   */
  private registerIpcHandlers(): void {
    // 开始下载
    const startHandler = async (_event: Electron.IpcMainEvent, datasetId: string, datasetName: string, url: string) => {
      await this.startDownload(_event.sender, datasetId, datasetName, url)
    }
    ipcMain.on('kb_dataset_download_start', startHandler)
    this.ipcCleanups.push(() => ipcMain.removeListener('kb_dataset_download_start', startHandler))

    // 暂停下载
    const pauseHandler = (_event: Electron.IpcMainEvent, datasetId: string) => {
      this.pauseDownload(datasetId)
    }
    ipcMain.on('kb_dataset_download_pause', pauseHandler)
    this.ipcCleanups.push(() => ipcMain.removeListener('kb_dataset_download_pause', pauseHandler))

    // 恢复下载
    const resumeHandler = (_event: Electron.IpcMainEvent, datasetId: string) => {
      this.resumeDownload(datasetId)
    }
    ipcMain.on('kb_dataset_download_resume', resumeHandler)
    this.ipcCleanups.push(() => ipcMain.removeListener('kb_dataset_download_resume', resumeHandler))

    // 取消下载
    const cancelHandler = (_event: Electron.IpcMainEvent, datasetId: string) => {
      this.cancelDownload(datasetId)
    }
    ipcMain.on('kb_dataset_download_cancel', cancelHandler)
    this.ipcCleanups.push(() => ipcMain.removeListener('kb_dataset_download_cancel', cancelHandler))
  }

  /**
   * 设置 Electron session 下载监听（在 app ready 后调用）
   */
  setupSessionListener(session: Electron.Session): void {
    const willDownloadHandler = (_event: Electron.Event, item: Electron.DownloadItem) => {
      // 根据保存路径匹配对应的 datasetId
      let matchedId: string | undefined
      for (const [id, dl] of this.activeDownloads) {
        if (dl.state === 'pending' && item.getSavePath() === dl.item.getSavePath()) {
          matchedId = id
          break
        }
      }

      if (!matchedId) {
        // 用文件名匹配兜底
        const savePath = item.getSavePath()
        for (const [id, dl] of this.activeDownloads) {
          if (dl.state === 'pending') {
            matchedId = id
            break
          }
        }
      }

      if (!matchedId) {
        this.logger.warn(`收到未匹配的下载事件: ${item.getFilename()}`)
        return
      }

      const download = this.activeDownloads.get(matchedId)!
      download.item = item
      download.state = 'downloading'

      const webContents = this.findWebContents()

      // 进度更新
      item.on('updated', (_e: Electron.Event, state: string) => {
        if (state === 'interrupted') {
          download.state = 'interrupted'
          this.sendProgress(webContents, {
            datasetId: matchedId!,
            datasetName: download.datasetName,
            state: 'interrupted',
            receivedBytes: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes(),
            percent: 0,
            savePath: item.getSavePath()
          })
          return
        }

        const received = item.getReceivedBytes()
        const total = item.getTotalBytes()
        const percent = total > 0 ? Math.round((received / total) * 100) : 0

        this.sendProgress(webContents, {
          datasetId: matchedId!,
          datasetName: download.datasetName,
          state: 'downloading',
          receivedBytes: received,
          totalBytes: total,
          percent,
          savePath: item.getSavePath()
        })
      })

      // 下载完成
      item.once('done', (_e: Electron.Event, state: string) => {
        if (state === 'completed') {
          download.state = 'completed'
          this.sendProgress(webContents, {
            datasetId: matchedId!,
            datasetName: download.datasetName,
            state: 'completed',
            receivedBytes: item.getTotalBytes(),
            totalBytes: item.getTotalBytes(),
            percent: 100,
            savePath: item.getSavePath()
          })
          this.logger.info(`数据集下载完成: ${download.datasetName} → ${item.getSavePath()}`)
        } else if (state === 'cancelled') {
          download.state = 'cancelled'
          this.sendProgress(webContents, {
            datasetId: matchedId!,
            datasetName: download.datasetName,
            state: 'cancelled',
            receivedBytes: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes(),
            percent: 0,
            savePath: item.getSavePath()
          })
        } else {
          download.state = 'interrupted'
          this.sendProgress(webContents, {
            datasetId: matchedId!,
            datasetName: download.datasetName,
            state: 'interrupted',
            receivedBytes: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes(),
            percent: 0,
            savePath: item.getSavePath()
          })
          this.logger.warn(`数据集下载中断: ${download.datasetName}, state=${state}`)
        }

        // 清理
        this.activeDownloads.delete(matchedId!)
      })
    }

    session.on('will-download', willDownloadHandler)
    this.sessionCleanup = () => session.removeListener('will-download', willDownloadHandler)
  }

  /**
   * 开始下载数据集
   * 接收 ModelScope 页面 URL，自动查询文件列表并下载主数据文件
   */
  async startDownload(webContents: Electron.WebContents, datasetId: string, datasetName: string, pageUrl: string): Promise<void> {
    // 检查是否已在下载
    if (this.activeDownloads.has(datasetId)) {
      this.logger.warn(`数据集 ${datasetId} 已在下载中`)
      return
    }

    // 从页面 URL 解析 owner/name
    const parsed = this.parseModelScopeUrl(pageUrl)
    if (!parsed) {
      this.logger.error(`无法解析 ModelScope URL: ${pageUrl}`)
      this.sendProgress(webContents, {
        datasetId,
        datasetName,
        state: 'interrupted',
        receivedBytes: 0,
        totalBytes: 0,
        percent: 0,
        savePath: ''
      })
      return
    }

    // 查询文件列表，找到主数据文件
    const downloadUrl = await this.resolveDownloadUrl(parsed.owner, parsed.name)
    if (!downloadUrl) {
      this.logger.error(`无法找到数据集 ${datasetName} 的下载文件`)
      this.sendProgress(webContents, {
        datasetId,
        datasetName,
        state: 'interrupted',
        receivedBytes: 0,
        totalBytes: 0,
        percent: 0,
        savePath: ''
      })
      return
    }

    const fileName = this.sanitizeFileName(datasetName) + '.zip'
    const savePath = join(this.downloadDir, fileName)

    this.logger.info(`开始下载数据集: ${datasetName} (${downloadUrl})`)

    // 标记为 pending
    const placeholder = { getSavePath: () => savePath } as unknown as Electron.DownloadItem
    this.activeDownloads.set(datasetId, {
      item: placeholder,
      datasetId,
      datasetName,
      state: 'pending'
    })

    // 通过 Electron 下载（会触发 will-download 事件）
    webContents.downloadURL(downloadUrl)
  }

  /**
   * 从 ModelScope 页面 URL 解析 owner/name
   * 支持格式：https://modelscope.cn/datasets/{owner}/{name}
   */
  private parseModelScopeUrl(url: string): { owner: string; name: string } | null {
    const match = url.match(/modelscope\.cn\/datasets\/([^/]+)\/([^/?#]+)/)
    if (match) {
      return { owner: match[1], name: match[2] }
    }
    return null
  }

  /**
   * 查询 ModelScope 文件列表 API，找到主数据文件并返回下载 URL
   * 优先选择 .zip / .tar.gz / .jsonl / .parquet 等数据文件
   */
  private async resolveDownloadUrl(owner: string, name: string): Promise<string | null> {
    try {
      const treeUrl = `${MODELSCOPE_API}/datasets/${owner}/${name}/repo/tree?Revision=master`
      this.logger.info(`查询文件列表: ${treeUrl}`)

      const response = await fetch(treeUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json() as {
        Code: number
        Data?: { Files?: Array<{ Name: string; Path: string; Type: string; Size: number }> }
      }

      if (data.Code !== 200 || !data.Data?.Files) {
        throw new Error(`API 返回错误: Code=${data.Code}`)
      }

      const files = data.Data.Files.filter(f => f.Type === 'blob')

      // 优先级：.zip > .tar.gz > .jsonl > .parquet > .csv > 第一个非 py/md 文件
      const priorityExts = ['.zip', '.tar.gz', '.jsonl', '.parquet', '.csv', '.json']
      let selectedFile: typeof files[0] | null = null

      for (const ext of priorityExts) {
        const found = files.find(f => f.Name.toLowerCase().endsWith(ext))
        if (found) {
          selectedFile = found
          break
        }
      }

      // 兜底：选第一个非 py/md 的文件
      if (!selectedFile) {
        selectedFile = files.find(f => !f.Name.endsWith('.py') && !f.Name.endsWith('.md')) ?? null
      }

      if (!selectedFile) {
        this.logger.warn(`数据集 ${owner}/${name} 中没有找到可下载的数据文件`)
        return null
      }

      const downloadUrl = `${MODELSCOPE_API}/datasets/${owner}/${name}/repo?Revision=master&FilePath=${encodeURIComponent(selectedFile.Path)}`
      this.logger.info(`选定文件: ${selectedFile.Name} (${selectedFile.Size} bytes) → ${downloadUrl}`)
      return downloadUrl
    } catch (err) {
      this.logger.error(`查询文件列表失败: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * 暂停下载
   */
  pauseDownload(datasetId: string): void {
    const dl = this.activeDownloads.get(datasetId)
    if (dl && dl.state === 'downloading') {
      dl.item.pause()
      dl.state = 'paused'
      this.logger.info(`已暂停下载: ${dl.datasetName}`)
    }
  }

  /**
   * 恢复下载
   */
  resumeDownload(datasetId: string): void {
    const dl = this.activeDownloads.get(datasetId)
    if (dl && dl.state === 'paused') {
      dl.item.resume()
      dl.state = 'downloading'
      this.logger.info(`已恢复下载: ${dl.datasetName}`)
    }
  }

  /**
   * 取消下载
   */
  cancelDownload(datasetId: string): void {
    const dl = this.activeDownloads.get(datasetId)
    if (dl && (dl.state === 'downloading' || dl.state === 'paused')) {
      dl.item.cancel()
      dl.state = 'cancelled'
      this.activeDownloads.delete(datasetId)
      this.logger.info(`已取消下载: ${dl.datasetName}`)
    }
  }

  /**
   * 获取所有活跃下载的状态
   */
  getActiveDownloads(): DownloadProgress[] {
    const result: DownloadProgress[] = []
    for (const [, dl] of this.activeDownloads) {
      const received = dl.item.getReceivedBytes()
      const total = dl.item.getTotalBytes()
      result.push({
        datasetId: dl.datasetId,
        datasetName: dl.datasetName,
        state: dl.state,
        receivedBytes: received,
        totalBytes: total,
        percent: total > 0 ? Math.round((received / total) * 100) : 0,
        savePath: dl.item.getSavePath()
      })
    }
    return result
  }

  /**
   * 发送下载进度到渲染进程
   */
  private sendProgress(webContents: Electron.WebContents | null, progress: DownloadProgress): void {
    if (webContents && !webContents.isDestroyed()) {
      webContents.send('kb_dataset_download_progress', progress)
    }
  }

  /**
   * 查找活跃的 webContents
   */
  private findWebContents(): Electron.WebContents | null {
    const windows = BrowserWindow.getAllWindows()
    return windows.length > 0 ? windows[0].webContents : null
  }

  /**
   * 清理文件名中的非法字符
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100)
  }

  /**
   * 获取下载目录
   */
  getDownloadDir(): string {
    return this.downloadDir
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 暂停所有活跃下载
    for (const [id, dl] of this.activeDownloads) {
      if (dl.state === 'downloading') {
        dl.item.pause()
      }
    }

    // 清理 IPC 监听
    for (const cleanup of this.ipcCleanups) {
      cleanup()
    }
    this.ipcCleanups.length = 0

    // 清理 session 监听
    if (this.sessionCleanup) {
      this.sessionCleanup()
      this.sessionCleanup = undefined
    }

    this.logger.info('数据集下载管理器已清理')
  }
}
