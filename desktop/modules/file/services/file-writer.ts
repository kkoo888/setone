import { writeFile, mkdir, rename, unlink, access, realpath, stat } from 'fs/promises'
import { resolve, dirname, extname } from 'path'
import { randomBytes } from 'crypto'
import type { Logger } from '../../../src/main/types/logger'

export class FileWriterService {
  private logger: Logger
  private allowedExtensions: Set<string>
  private allowedDirs: string[]

  constructor(logger: Logger, settings?: { allowedExtensions?: string[]; allowedDirs?: string[] }) {
    this.logger = logger
    this.allowedExtensions = new Set(settings?.allowedExtensions ?? ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html', '.py', '.go', '.rs'])
    this.allowedDirs = settings?.allowedDirs ?? []
  }

  private async validatePath(filePath: string): Promise<string> {
    const resolved = resolve(filePath)
    let real: string
    try { real = await realpath(resolved) } catch { real = resolved }
    if (this.allowedDirs.length > 0) {
      const inAllowed = this.allowedDirs.some((d) => real.startsWith(resolve(d)))
      if (!inAllowed) throw new Error(`路径不在允许范围内: ${filePath}`)
    }
    const ext = extname(real)
    if (ext && !this.allowedExtensions.has(ext)) throw new Error(`不允许的文件类型: ${ext}`)
    return real
  }

  /** 原子写入：先写临时文件，再 rename */
  async write(filePath: string, content: string): Promise<{ path: string; size: number }> {
    const validPath = await this.validatePath(filePath)
    const dir = dirname(validPath)
    await mkdir(dir, { recursive: true })
    const tmpPath = `${validPath}.${randomBytes(8).toString('hex')}.tmp`
    try {
      await writeFile(tmpPath, content, 'utf-8')
      await rename(tmpPath, validPath)
      this.logger.debug(`文件已写入: ${validPath} (${content.length} chars)`)
      return { path: validPath, size: content.length }
    } catch (e) {
      try { await unlink(tmpPath) } catch { /* ignore */ }
      throw e
    }
  }

  async append(filePath: string, content: string): Promise<void> {
    const validPath = await this.validatePath(filePath)
    const { appendFile } = await import('fs/promises')
    await appendFile(validPath, content, 'utf-8')
  }
}
