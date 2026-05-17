import { Notification } from 'electron'
import { execSync } from 'child_process'
import type { Logger } from '../../../src/main/types/logger'

export interface NotificationOptions {
  body?: string
  icon?: string
  silent?: boolean
  onClick?: () => void
}

export class NotificationService {
  private logger: Logger
  private notifySendAvailable: boolean | null = null

  constructor(logger: Logger) {
    this.logger = logger
    if (process.platform === 'linux') this.detectNotifySend()
  }

  private detectNotifySend(): void {
    try { execSync('which notify-send', { stdio: 'ignore' }); this.notifySendAvailable = true } catch { this.notifySendAvailable = false }
  }

  private sendViaNotifySend(title: string, opts: NotificationOptions): boolean {
    if (!this.notifySendAvailable) return false
    try {
      const escapedTitle = title.replace(/'/g, "'\\''")
      const escapedBody = (opts.body ?? '').replace(/'/g, "'\\''")
      const args = ['notify-send']
      if (opts.icon) args.push(`-i '${opts.icon.replace(/'/g, "'\\''")}'`)
      args.push('-t 5000', `'${escapedTitle}'`)
      if (opts.body) args.push(`'${escapedBody}'`)
      execSync(args.join(' '), { stdio: 'ignore', timeout: 5000 })
      return true
    } catch { return false }
  }

  send(title: string, options: NotificationOptions | string = {}): boolean {
    const opts: NotificationOptions = typeof options === 'string' ? { body: options } : options
    if (!Notification.isSupported()) {
      if (process.platform === 'linux') return this.sendViaNotifySend(title, opts)
      return false
    }
    try {
      const notification = new Notification({ title, body: opts.body ?? '', icon: opts.icon, silent: opts.silent ?? false })
      if (opts.onClick) notification.on('click', () => { try { opts.onClick!() } catch (e) { this.logger.error('通知点击回调异常', e as Error) } })
      notification.show()
      return true
    } catch (e) {
      if (process.platform === 'linux') return this.sendViaNotifySend(title, opts)
      this.logger.error(`发送通知失败: ${title}`, e as Error)
      return false
    }
  }

  notify(title: string, body: string, onClick?: () => void): boolean { return this.send(title, { body, onClick }) }
  isSupported(): boolean { return Notification.isSupported() || (process.platform === 'linux' && !!this.notifySendAvailable) }
}
