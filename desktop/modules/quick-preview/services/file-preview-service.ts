import { readFile, stat } from 'fs/promises'
import { dialog } from 'electron'

/**
 * 文件预览服务
 * 读取文件内容并返回预览结果
 */
export class FilePreviewService {
  private readonly maxSize = 10 * 1024 * 1024 // 10MB
  private readonly imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']

  async preview(path: string): Promise<{ path: string; content: string; type: 'text' | 'image'; size: number; modified: number }> {
    const stats = await stat(path)
    if (stats.size > this.maxSize) throw new Error('文件过大（>10MB）')

    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    if (this.imageExts.includes(ext)) {
      return { path, content: '[图片文件]', type: 'image', size: stats.size, modified: stats.mtimeMs }
    }

    const content = await readFile(path, 'utf-8')
    return { path, content, type: 'text', size: stats.size, modified: stats.mtimeMs }
  }

  async openDialog(): Promise<string | null> {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  }
}
