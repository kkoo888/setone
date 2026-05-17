import { app } from 'electron'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import type { Logger, LogLevel } from '../types/logger'
import { FileTransport, ConsoleTransport, type LogTransport } from './log-transport'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

export class AppLogger implements Logger {
  private level: LogLevel
  private transports: LogTransport[] = []
  private moduleId: string
  private logDir: string
  private errorTransport?: FileTransport
  private initialized: Promise<void>

  constructor(moduleId: string, level: LogLevel = 'info') {
    this.moduleId = moduleId
    this.level = level
    this.logDir = join(app.getPath('userData'), 'logs')

    this.initialized = this.init()
  }

  private async init(): Promise<void> {
    try {
      await mkdir(this.logDir, { recursive: true })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        console.error('[Logger] 创建日志目录失败:', err)
      }
    }

    this.transports.push(new ConsoleTransport(this.moduleId))
    this.transports.push(new FileTransport(this.moduleId, this.logDir))

    this.errorTransport = new FileTransport('error', this.logDir)
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  debug(message: string, meta?: object): void {
    this.log('debug', message, undefined, meta)
  }

  info(message: string, meta?: object): void {
    this.log('info', message, undefined, meta)
  }

  warn(message: string, meta?: object): void {
    this.log('warn', message, undefined, meta)
  }

  error(message: string, error?: Error, meta?: object): void {
    this.log('error', message, error, meta)
  }

  private async log(level: LogLevel, message: string, error?: Error, meta?: object): Promise<void> {
    await this.initialized

    if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) return

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      moduleId: this.moduleId,
      message,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
      meta
    }

    for (const transport of this.transports) {
      transport.write(entry)
    }

    if (level === 'error' && this.errorTransport) {
      this.errorTransport.write(entry)
    }
  }
}

/** 创建模块级别的 Logger */
export function createLogger(moduleId: string, level?: LogLevel): Logger {
  return new AppLogger(moduleId, level)
}
