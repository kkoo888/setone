/**
 * Live2D Cubism 5 模块
 * 基于 Cubism 5 SDK for Web R5
 * 独立窗口运行，与旧版 Live2D 模块完全隔离
 */
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'

export default class Live2D5Module implements Module {
  id = 'live2d-5'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private petWindow: import('electron').BrowserWindow | null = null

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.registerIPC()
    context.logger.info('Live2D Cubism 5 模块已激活')
  }

  async deactivate(): Promise<void> {
    this.closePetWindow()
    this.context.logger.info('Live2D Cubism 5 模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool',
        name: 'live2d5_open',
        description: '打开 Live2D 5 桌面宠物窗口',
        priority: 10,
        execute: async () => {
          await this.openPetWindow()
          return { success: true, message: 'Live2D 5 宠物窗口已打开' }
        },
      },
      {
        type: 'tool',
        name: 'live2d5_close',
        description: '关闭 Live2D 5 桌面宠物窗口',
        priority: 10,
        execute: async () => {
          this.closePetWindow()
          return { success: true, message: 'Live2D 5 宠物窗口已关闭' }
        },
      },
    ]
  }

  /** 注册 IPC 通道（使用 live2d5: 前缀，避免与旧模块冲突） */
  private registerIPC(): void {
    const { ipcMain } = require('electron')

    ipcMain.handle('live2d5:create-window', async () => {
      await this.openPetWindow()
    })

    ipcMain.handle('live2d5:close-window', async () => {
      this.closePetWindow()
    })

    ipcMain.handle('live2d5:get-status', async () => {
      return {
        windowOpen: this.petWindow !== null && !this.petWindow.isDestroyed(),
      }
    })
  }

  /** 打开宠物窗口（独立 renderer 进程，Cubism 5 SDK 独立加载） */
  private async openPetWindow(): Promise<void> {
    const { BrowserWindow } = require('electron')
    const { join } = require('path')

    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.focus()
      return
    }

    this.petWindow = new BrowserWindow({
      width: 400,
      height: 500,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, 'preload.js'),
      },
    })

    this.petWindow.setIgnoreMouseEvents(false)

    // 加载独立的 Live2D 5 页面（独立 renderer，不会与旧 SDK 冲突）
    if (process.env.VITE_DEV_SERVER_URL) {
      this.petWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/live2d5-pet`)
    } else {
      this.petWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '#/live2d5-pet',
      })
    }

    this.petWindow.on('closed', () => {
      this.petWindow = null
    })
  }

  /** 关闭宠物窗口 */
  private closePetWindow(): void {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.close()
    }
    this.petWindow = null
  }
}
