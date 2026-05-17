/**
 * 系统托盘管理
 * 支持最小化到托盘、右键菜单、窗口显示/隐藏
 */
import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron'
import { join } from 'path'
import type { ConfigManager } from './types/config'

let tray: Tray | null = null

/**
 * 创建系统托盘
 * @param getMainWindow - 获取主窗口的函数
 * @param config - 配置管理器
 */
export function createTray(
  getMainWindow: () => BrowserWindow | null,
  config: ConfigManager
): Tray {
  // 蓝色云朵图标
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,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'
  )

  tray = new Tray(icon)
  tray.setToolTip('小茜 - 智能桌面助手')

  /** 更新托盘菜单 */
  const updateMenu = async (): Promise<void> => {
    // 读取 appSettings.general.minimizeToTray，与设置页保持一致
    const appSettings = await config.get<Record<string, unknown>>('appSettings', {})
    const general = (appSettings as Record<string, Record<string, unknown>>)?.general as Record<string, unknown> | undefined
    const minimizeToTray = (general?.minimizeToTray as boolean) ?? true
    const menu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          const win = getMainWindow()
          if (win) {
            win.show()
            win.focus()
          }
        }
      },
      { type: 'separator' },
      {
        label: minimizeToTray ? '✓ 最小化到托盘' : '  最小化到托盘',
        click: async () => {
          // 同步更新 appSettings.general.minimizeToTray
          const currentSettings = await config.get<Record<string, unknown>>('appSettings', {})
          const settings = { ...(currentSettings as Record<string, unknown>) } as Record<string, Record<string, unknown>>
          if (!settings.general) settings.general = {}
          settings.general.minimizeToTray = !minimizeToTray
          await config.set('appSettings', settings)
          updateMenu()
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          // 标记为真正退出，不拦截
          app.quit()
        }
      }
    ])
    tray!.setContextMenu(menu)
  }

  tray.on('double-click', () => {
    const win = getMainWindow()
    if (win) {
      win.show()
      win.focus()
    }
  })

  void updateMenu()
  return tray
}

/**
 * 处理窗口关闭事件（最小化到托盘）
 * @returns true 表示已拦截关闭（最小化到托盘），false 表示允许正常关闭
 */
export async function handleWindowClose(
  event: Electron.Event,
  window: BrowserWindow,
  config: ConfigManager
): Promise<boolean> {
  // 读取 appSettings.general.minimizeToTray
  const appSettings = await config.get<Record<string, unknown>>('appSettings', {})
  const general = (appSettings as Record<string, Record<string, unknown>>)?.general as Record<string, unknown> | undefined
  const minimizeToTray = (general?.minimizeToTray as boolean) ?? true
  if (minimizeToTray) {
    event.preventDefault()
    window.hide()
    return true
  }
  return false
}

/**
 * 销毁托盘
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
