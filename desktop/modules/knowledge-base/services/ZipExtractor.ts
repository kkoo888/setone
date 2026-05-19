import { join, extname } from 'path'
import { mkdir, writeFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import type { Logger } from '../../../src/main/types/logger'

/**
 * ZIP 解压工具
 * 支持 .zip 和 .tar.gz 文件的解压
 */
export class ZipExtractor {
  private readonly logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  /**
   * 解压文件到指定目录
   * @param archivePath - 压缩包路径
   * @param extractDir - 解压目标目录
   * @returns 解压后的文件路径列表
   */
  async extract(archivePath: string, extractDir: string): Promise<string[]> {
    const ext = extname(archivePath).toLowerCase()

    // .tar.gz 需要特殊处理
    if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
      return await this.extractTarGz(archivePath, extractDir)
    }

    switch (ext) {
      case '.zip':
        return await this.extractZip(archivePath, extractDir)
      default:
        throw new Error(`不支持的压缩格式: ${ext}`)
    }
  }

  /**
   * 解压 .zip 文件
   */
  private async extractZip(zipPath: string, extractDir: string): Promise<string[]> {
    let yauzl: any
    try {
      yauzl = await import('yauzl')
    } catch {
      throw new Error('yauzl 未安装，无法解压 ZIP 文件。请运行: npm install yauzl')
    }

    await mkdir(extractDir, { recursive: true })
    const extractedFiles: string[] = []

    return new Promise((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true }, (err: any, zipfile: any) => {
        if (err) return reject(err)

        zipfile.readEntry()

        zipfile.on('entry', (entry: any) => {
          const entryPath = join(extractDir, entry.fileName)

          // 安全检查：防止路径穿越攻击
          if (!entryPath.startsWith(extractDir)) {
            this.logger.warn(`跳过不安全路径: ${entry.fileName}`)
            zipfile.readEntry()
            return
          }

          if (/\/$/.test(entry.fileName)) {
            // 目录条目
            mkdir(entryPath, { recursive: true }).then(() => {
              zipfile.readEntry()
            })
          } else {
            // 文件条目
            zipfile.openReadStream(entry, (readErr: any, readStream: any) => {
              if (readErr) {
                this.logger.warn(`读取条目失败: ${entry.fileName} - ${readErr.message}`)
                zipfile.readEntry()
                return
              }

              const chunks: Buffer[] = []
              readStream.on('data', (chunk: Buffer) => chunks.push(chunk))
              readStream.on('end', () => {
                const dir = join(entryPath, '..')
                mkdir(dir, { recursive: true }).then(() => {
                  writeFile(entryPath, Buffer.concat(chunks)).then(() => {
                    extractedFiles.push(entryPath)
                    zipfile.readEntry()
                  })
                })
              })
              readStream.on('error', () => zipfile.readEntry())
            })
          }
        })

        zipfile.on('end', () => {
          this.logger.info(`ZIP 解压完成: ${extractedFiles.length} 个文件`)
          resolve(extractedFiles)
        })

        zipfile.on('error', (err: any) => {
          reject(new Error(`ZIP 解压失败: ${err.message}`))
        })
      })
    })
  }

  /**
   * 解压 .tar.gz 文件
   */
  private async extractTarGz(tarPath: string, extractDir: string): Promise<string[]> {
    const { createReadStream } = await import('fs')
    const { createGunzip } = await import('zlib')

    let tar: any
    try {
      tar = await import('tar')
    } catch {
      throw new Error('tar 未安装，无法解压 .tar.gz 文件。请运行: npm install tar')
    }

    await mkdir(extractDir, { recursive: true })
    const extractedFiles: string[] = []

    return new Promise((resolve, reject) => {
      const extract = tar.extract({
        cwd: extractDir,
        onentry: (entry: any) => {
          extractedFiles.push(join(extractDir, entry.path))
        }
      })

      createReadStream(tarPath)
        .pipe(createGunzip())
        .pipe(extract)
        .on('end', () => {
          this.logger.info(`tar.gz 解压完成: ${extractedFiles.length} 个文件`)
          resolve(extractedFiles)
        })
        .on('error', (err: any) => {
          reject(new Error(`tar.gz 解压失败: ${err.message}`))
        })
    })
  }

  /**
   * 清理解压的临时目录
   */
  async cleanup(dir: string): Promise<void> {
    try {
      if (existsSync(dir)) {
        await rm(dir, { recursive: true, force: true })
        this.logger.info(`已清理临时目录: ${dir}`)
      }
    } catch (err) {
      this.logger.warn(`清理临时目录失败: ${(err as Error).message}`)
    }
  }
}
