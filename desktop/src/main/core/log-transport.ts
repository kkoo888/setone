import { appendFile } from 'fs/promises'
import { join } from 'path'
import { LogRotationManager } from './log-rotation'

export interface LogEntry {
  timestamp: string
  level: string
  moduleId: string
  message: string
  error?: { name: string; message: string; stack?: string }
  meta?: object
}

export interface LogTransport {
  write(entry: LogEntry): void | Promise<void>
}

/** 控制台传输器 */
export class ConsoleTransport implements LogTransport {
  constructor(private moduleId: string) {}

  write(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${this.moduleId}]`
    const msg = `${prefix} ${entry.message}`

    switch (entry.level) {
      case 'debug':
        console.debug(msg, entry.meta || '')
        break
      case 'info':
        console.info(msg, entry.meta || '')
        break
      case 'warn':
        console.warn(msg, entry.meta || '')
        break
      case 'error':
        console.error(msg, entry.error || '', entry.meta || '')
        break
    }
  }
}

/** 文件传输器（委托 LogRotationManager 处理轮转） */
export class FileTransport implements LogTransport {
  private filePath: string
  private rotation: LogRotationManager
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(moduleId: string, logDir: string) {
    this.filePath = join(logDir, `${moduleId}.log`)
    this.rotation = new LogRotationManager()
  }

  write(entry: LogEntry): void {
    // 使用 Promise 链串行写入，避免并发写入导致文件损坏
    this.writeQueue = this.writeQueue.then(() => this.doWrite(entry)).catch((err) => {
      console.error(`[LogTransport] 写入失败 [${this.filePath}]:`, err)
      console.warn(`[LogTransport] 降级输出: ${JSON.stringify(entry)}`)
    })
  }

  private async doWrite(entry: LogEntry): Promise<void> {
    await this.rotation.rotateIfNeeded(this.filePath)
    const line = JSON.stringify(entry) + '\n'
    await appendFile(this.filePath, line, 'utf-8')
  }
}
