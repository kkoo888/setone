/**
 * Live2D Cubism 5 模块
 * 基于 Cubism 5 SDK for Web R5
 * 独立窗口运行，与旧版 Live2D 模块完全隔离
 */
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'

/** 宠物窗口默认尺寸 */
const PET_WINDOW_WIDTH = 400
const PET_WINDOW_HEIGHT = 500

export default class Live2D5Module implements Module {
  id = 'live2d-5'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private petWindow: import('electron').BrowserWindow | null = null
  private ipcHandlers: string[] = []

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.registerIPC()
    context.logger.info('Live2D Cubism 5 模块已激活')
  }

  async deactivate(): Promise<void> {
    this.closePetWindow()
    this.unregisterIPC()
    this.context.logger.info('Live2D Cubism 5 模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool',
        name: 'live2d5_open',
        description: '打开 Live2D 5 桌面宠物窗口',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: {
          execute: async () => {
            await this.openPetWindow()
            return { success: true, message: 'Live2D 5 宠物窗口已打开' }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_close',
        description: '关闭 Live2D 5 桌面宠物窗口',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: {
          execute: async () => {
            this.closePetWindow()
            return { success: true, message: 'Live2D 5 宠物窗口已关闭' }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_expression',
        description: '切换 Live2D 5 表情',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            expressionId: { type: 'string', description: '表情 ID' }
          },
          required: ['expressionId']
        },
        handler: {
          execute: async (p) => {
            const { expressionId } = p as { expressionId: string }
            this.petWindow?.webContents.send('live2d5:set-expression', expressionId)
            return { success: true, message: `切换表情: ${expressionId}` }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_motion',
        description: '播放 Live2D 5 动作',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            motionId: { type: 'string', description: '动作 ID' }
          },
          required: ['motionId']
        },
        handler: {
          execute: async (p) => {
            const { motionId } = p as { motionId: string }
            this.petWindow?.webContents.send('live2d5:play-motion', motionId)
            return { success: true, message: `播放动作: ${motionId}` }
          }
        }
      }
    ]
  }

  /** 注册 IPC 通道（使用 live2d5: 前缀，避免与旧模块冲突） */
  private registerIPC(): void {
    const { ipcMain } = require('electron')

    ipcMain.handle('live2d5:create-window', async () => {
      await this.openPetWindow()
    })
    this.ipcHandlers.push('live2d5:create-window')

    ipcMain.handle('live2d5:close-window', async () => {
      this.closePetWindow()
    })
    this.ipcHandlers.push('live2d5:close-window')

    ipcMain.handle('live2d5:get-status', async () => {
      return {
        windowOpen: this.petWindow !== null && !this.petWindow.isDestroyed()
      }
    })
    this.ipcHandlers.push('live2d5:get-status')
  }

  /** 注销 IPC 处理器 */
  private unregisterIPC(): void {
    const { ipcMain } = require('electron')
    for (const channel of this.ipcHandlers) {
      ipcMain.removeHandler(channel)
    }
    this.ipcHandlers = []
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
      width: PET_WINDOW_WIDTH,
      height: PET_WINDOW_HEIGHT,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, 'preload.js')
      }
    })

    this.petWindow.setIgnoreMouseEvents(false)

    // 加载独立的 Live2D 5 页面（独立 renderer，不会与旧 SDK 冲突）
    if (process.env.VITE_DEV_SERVER_URL) {
      this.petWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/live2d5-pet`)
    } else {
      this.petWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '#/live2d5-pet'
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
