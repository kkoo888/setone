import { readFile, access, realpath, stat } from 'fs/promises'
import { resolve, extname } from 'path'
import type { Logger } from '../../../src/main/types/logger'

export class FileReaderService {
  private logger: Logger
  private allowedExtensions: Set<string>
  private allowedDirs: string[]
  private maxFileSize: number

  constructor(logger: Logger, settings?: { allowedExtensions?: string[]; allowedDirs?: string[]; maxFileSizeMB?: number }) {
    this.logger = logger
    this.allowedExtensions = new Set(settings?.allowedExtensions ?? ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html', '.py', '.go', '.rs'])
    this.allowedDirs = settings?.allowedDirs ?? []
    this.maxFileSize = (settings?.maxFileSizeMB ?? 50) * 1024 * 1024
  }

  private async validatePath(filePath: string): Promise<string> {
    const resolved = resolve(filePath)
    const real = await realpath(resolved)
    if (this.allowedDirs.length > 0) {
      const inAllowed = this.allowedDirs.some((d) => real.startsWith(resolve(d)))
      if (!inAllowed) throw new Error(`路径不在允许范围内: ${filePath}`)
    }
    const ext = extname(real)
    if (ext && !this.allowedExtensions.has(ext)) throw new Error(`不允许的文件类型: ${ext}`)
    const s = await stat(real)
    if (s.size > this.maxFileSize) throw new Error(`文件过大: ${(s.size / 1024 / 1024).toFixed(1)}MB > ${this.maxFileSize / 1024 / 1024}MB`)
    return real
  }

  async read(filePath: string): Promise<{ content: string; path: string; size: number }> {
    const validPath = await this.validatePath(filePath)
    const content = await readFile(validPath, 'utf-8')
    this.logger.debug(`文件已读取: ${validPath} (${content.length} chars)`)
    return { content, path: validPath, size: content.length }
  }

  async readLines(filePath: string, start: number, end: number): Promise<string[]> {
    const { content } = await this.read(filePath)
    return content.split('\n').slice(start, end)
  }
}
