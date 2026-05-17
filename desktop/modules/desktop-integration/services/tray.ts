import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Logger } from '../../../src/main/types/logger'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class TrayService {
  private tray: Tray | null = null
  private mainWindow: BrowserWindow | null = null
  private logger: Logger
  private iconPath: string

  constructor(logger: Logger, iconPath?: string) {
    this.logger = logger
    const iconFile = process.platform === 'win32' ? 'tray-icon.ico' : 'tray-icon.png'
    this.iconPath = iconPath ?? (app.isPackaged
      ? join(process.resourcesPath, 'resources', iconFile)
      : join(__dirname, '../../resources', iconFile))
  }

  create(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
    const icon = nativeImage.createFromPath(this.iconPath)
    if (icon.isEmpty()) this.logger.warn(`托盘图标加载失败，路径: ${this.iconPath}`)
    if (process.platform === 'darwin') icon.setTemplateImage(true)

    this.tray = new Tray(icon)
    this.tray.setToolTip('智能桌面助手')
    this.updateContextMenu()

    if (process.platform === 'darwin') {
      this.tray.on('click', () => { this.tray?.popUpContextMenu() })
    } else {
      this.tray.on('click', () => {
        if (this.mainWindow) {
          if (this.mainWindow.isVisible()) this.mainWindow.hide()
          else { this.mainWindow.show(); this.mainWindow.focus() }
        }
      })
    }
    this.logger.info('系统托盘已创建')
  }

  updateContextMenu(): void {
    if (!this.tray) return
    const isVisible = this.mainWindow?.isVisible() ?? false
    const contextMenu = Menu.buildFromTemplate([
      { label: isVisible ? '隐藏主窗口' : '显示主窗口', click: () => { if (this.mainWindow) { if (this.mainWindow.isVisible()) this.mainWindow.hide(); else { this.mainWindow.show(); this.mainWindow.focus() } } } },
      { type: 'separator' },
      { label: '设置', click: () => { this.mainWindow?.webContents.send('navigate', 'settings'); this.mainWindow?.show() } },
      { label: '模块管理', click: () => { this.mainWindow?.webContents.send('navigate', 'modules'); this.mainWindow?.show() } },
      { type: 'separator' },
      { label: '退出', click: () => { this.destroy(); app.quit() } }
    ])
    this.tray.setContextMenu(contextMenu)
  }

  destroy(): void { this.tray?.destroy(); this.tray = null }
}
