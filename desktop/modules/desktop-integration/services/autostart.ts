import { app } from 'electron'
import type { Logger } from '../../../src/main/types/logger'

export class AutostartService {
  private logger: Logger
  constructor(logger: Logger) { this.logger = logger }

  isEnabled(): boolean { try { return app.getLoginItemSettings().openAtLogin } catch { return false } }

  setEnabled(enabled: boolean): boolean {
    try {
      app.setLoginItemSettings({ openAtLogin: enabled, ...(process.platform === 'darwin' && { openAsHidden: true }), ...(process.platform === 'win32' && { args: ['--hidden'] }) })
      this.logger.info(`开机自启已${enabled ? '启用' : '禁用'}`)
      return true
    } catch (e) { this.logger.error(`设置开机自启失败`, e as Error); return false }
  }

  toggle(): boolean { const cur = this.isEnabled(); const ok = this.setEnabled(!cur); return ok ? !cur : cur }
}
