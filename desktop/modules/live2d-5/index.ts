/**
 * Live2D Cubism 5 模块
 * 基于 Cubism 5 SDK for Web R5
 * 独立窗口运行，与旧版 Live2D 模块完全隔离
 *
 * 所有能力统一通过 getCapabilities() 暴露，不使用内部 IPC。
 */
console.log('[Live2D5] 🔵 模块 index.ts 文件已加载')
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 宠物窗口默认尺寸 */
const PET_WINDOW_WIDTH = 400
const PET_WINDOW_HEIGHT = 500

export default class Live2D5Module implements Module {
  id = 'live2d-5'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private petWindow: import('electron').BrowserWindow | null = null
  private destroyResolve: (() => void) | null = null

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.registerIPCHandlers()
    context.logger.info('Live2D Cubism 5 模块已激活')
  }

  async deactivate(): Promise<void> {
    this.unregisterIPCHandlers()
    await this.closePetWindow()
    this.context.logger.info('Live2D Cubism 5 模块已停用')
  }

  /**
   * 注册 IPC handlers — 让 renderer 可以通过 invoke 直接调用模块能力
   * 这是 getCapabilities() 的补充，getCapabilities 给 AI 用，IPCHandler 给 renderer 用
   */
  private registerIPCHandlers(): void {
    ipcMain.handle('live2d5_open', async () => {
      try {
        await this.openPetWindow()
        return { success: true, message: 'Live2D 5 宠物窗口已打开' }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })

    ipcMain.handle('live2d5_close', async () => {
      try {
        await this.closePetWindow()
        return { success: true, message: 'Live2D 5 宠物窗口已关闭' }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })

    ipcMain.handle('live2d5_status', async () => {
      return {
        success: true,
        data: {
          windowOpen: this.petWindow !== null && !this.petWindow.isDestroyed()
        }
      }
    })

    ipcMain.handle('live2d5_expression', async (_event, args: { expressionId: string }) => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        this.petWindow.webContents.send('live2d5:set-expression', args.expressionId)
      }
      return { success: true, message: `切换表情: ${args.expressionId}` }
    })

    ipcMain.handle('live2d5_motion', async (_event, args: { motionId: string }) => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        this.petWindow.webContents.send('live2d5:play-motion', args.motionId)
      }
      return { success: true, message: `播放动作: ${args.motionId}` }
    })

    ipcMain.handle('live2d5_start_drag', async () => {
      this.startWindowDrag()
      return { success: true }
    })

    // live2d5:request-drag: renderer 通过 invoke 调用，主进程处理窗口拖拽
    ipcMain.handle('live2d5:request-drag', async () => {
      this.startWindowDrag()
    })

    // ★ 新增：获取已加载模型列表
    ipcMain.handle('live2d5_get_models', async () => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const result = await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.getLoadedModels?.() ?? []`
        ).catch(() => [])
        return { success: true, data: result }
      }
      return { success: true, data: [] }
    })

    // ★ 新增：切换模型
    ipcMain.handle('live2d5_switch_model', async (_event, args: { name: string }) => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const result = await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.switchModel?.("${args.name}") ?? false`
        ).catch(() => false)
        return { success: result }
      }
      return { success: false, error: '宠物窗口未打开' }
    })

    // ★ 新增：卸载模型（释放 GPU 资源）
    ipcMain.handle('live2d5_unload_model', async (_event, args: { name: string }) => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const result = await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.unloadModel?.("${args.name}") ?? false`
        ).catch(() => false)
        return { success: result }
      }
      return { success: false, error: '宠物窗口未打开' }
    })
  }

  /** 注销 IPC handlers */
  private unregisterIPCHandlers(): void {
    ipcMain.removeHandler('live2d5_open')
    ipcMain.removeHandler('live2d5_close')
    ipcMain.removeHandler('live2d5_status')
    ipcMain.removeHandler('live2d5_expression')
    ipcMain.removeHandler('live2d5_motion')
    ipcMain.removeHandler('live2d5_start_drag')
    ipcMain.removeHandler('live2d5:request-drag')
    ipcMain.removeHandler('live2d5_get_models')
    ipcMain.removeHandler('live2d5_switch_model')
    ipcMain.removeHandler('live2d5_unload_model')
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
            await this.closePetWindow()
            return { success: true, message: 'Live2D 5 宠物窗口已关闭' }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_status',
        description: '查询 Live2D 5 宠物窗口状态',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: {
          execute: async () => {
            return {
              success: true,
              data: {
                windowOpen: this.petWindow !== null && !this.petWindow.isDestroyed()
              }
            }
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
            if (this.petWindow && !this.petWindow.isDestroyed()) {
              this.petWindow.webContents.send('live2d5:set-expression', expressionId)
            }
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
            if (this.petWindow && !this.petWindow.isDestroyed()) {
              this.petWindow.webContents.send('live2d5:play-motion', motionId)
            }
            return { success: true, message: `播放动作: ${motionId}` }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_start_drag',
        description: '开始拖拽 Live2D 5 宠物窗口',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: {
          execute: async () => {
            // 在主进程直接执行窗口拖拽
            this.startWindowDrag()
            return { success: true }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_get_models',
        description: '获取已加载的 Live2D 5 模型列表',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: {
          execute: async () => {
            if (this.petWindow && !this.petWindow.isDestroyed()) {
              const result = await this.petWindow.webContents.executeJavaScript(
                `window.__cubism5Service?.getLoadedModels?.() ?? []`
              ).catch(() => [])
              return { success: true, data: result }
            }
            return { success: true, data: [] }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_switch_model',
        description: '切换 Live2D 5 当前显示的模型',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '模型名称' }
          },
          required: ['name']
        },
        handler: {
          execute: async (p) => {
            const { name } = p as { name: string }
            if (this.petWindow && !this.petWindow.isDestroyed()) {
              const result = await this.petWindow.webContents.executeJavaScript(
                `window.__cubism5Service?.switchModel?.("${name}") ?? false`
              ).catch(() => false)
              return { success: result }
            }
            return { success: false, error: '宠物窗口未打开' }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_unload_model',
        description: '卸载指定 Live2D 5 模型并释放 GPU 资源',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '模型名称' }
          },
          required: ['name']
        },
        handler: {
          execute: async (p) => {
            const { name } = p as { name: string }
            if (this.petWindow && !this.petWindow.isDestroyed()) {
              const result = await this.petWindow.webContents.executeJavaScript(
                `window.__cubism5Service?.unloadModel?.("${name}") ?? false`
              ).catch(() => false)
              return { success: result }
            }
            return { success: false, error: '宠物窗口未打开' }
          }
        }
      }
    ]
  }

  /**
   * 开始窗口拖拽（主进程实现）
   * 使用 BrowserWindow.startMoving() 或 fallback 到 setBounds
   */
  private startWindowDrag(): void {
    if (!this.petWindow || this.petWindow.isDestroyed()) return

    try {
      // Electron API: 拖拽整个窗口
      // 注意：此 API 在某些平台上可能不完全支持
      // 使用 IPC 调用来实现，由 renderer 端触发
      this.petWindow.webContents.send('live2d5:start-drag')
    } catch {
      // 忽略拖拽失败
    }
  }

  /** 打开宠物窗口（独立 renderer 进程，Cubism 5 SDK 独立加载） */
  private async openPetWindow(): Promise<void> {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.focus()
      return
    }

    console.log('[Live2D5] 🪟 开始创建宠物窗口...')

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

    // 监听页面加载失败
    this.petWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[Live2D5] ❌ 页面加载失败! errorCode=${errorCode}, desc=${errorDescription}, url=${validatedURL}`)
    })

    this.petWindow.webContents.on('did-finish-load', () => {
      console.log('[Live2D5] ✅ renderer 页面 did-finish-load')
    })

    // 捕获 renderer 端的 console 输出（关键！renderer 的 console.log 不会自动输出到主进程终端）
    this.petWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const prefix = ['verbose', 'info', 'warning', 'error'][level] ?? 'log'
      console.log(`[Live2D5:renderer:${prefix}] ${message} (${sourceId}:${line})`)
    })

    // 监听 renderer 崩溃
    this.petWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error(`[Live2D5] 💥 renderer 进程崩溃! reason=${details.reason}, exitCode=${details.exitCode}`)
    })

    // 监听 renderer 无响应
    this.petWindow.webContents.on('unresponsive', () => {
      console.error('[Live2D5] ⚠️ renderer 进程无响应!')
    })

    this.petWindow.webContents.on('responsive', () => {
      console.log('[Live2D5] ✅ renderer 进程恢复响应')
    })

    // 监听页面崩溃
    this.petWindow.on('crashed', () => {
      console.error('[Live2D5] 💥 宠物窗口崩溃!')
    })

    // 监听 renderer 端的清理完成确认（用于 closePetWindow）
    const cleanupHandler = () => {
      // 由 closePetWindow 处理
    }
    ipcMain.on('live2d5:cleanup-done', cleanupHandler)

    // 清理：窗口关闭时移除监听
    this.petWindow.on('closed', () => {
      console.log('[Live2D5] 🪟 宠物窗口已关闭')
      ipcMain.removeListener('live2d5:cleanup-done', cleanupHandler)
      this.petWindow = null
      // 如果有 deactivate 等待的 resolve，调用它
      if (this.destroyResolve) {
        this.destroyResolve()
        this.destroyResolve = null
      }
    })

    // 加载独立的 Live2D 5 页面（独立 renderer，不会与旧 SDK 冲突）
    console.log('[Live2D5] 🌐 VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL ?? '(undefined)')
    if (process.env.VITE_DEV_SERVER_URL) {
      const url = `${process.env.VITE_DEV_SERVER_URL}#/live2d5-pet`
      console.log('[Live2D5] 🌐 加载 URL:', url)
      await this.petWindow.loadURL(url)
      console.log('[Live2D5] ✅ 页面加载完成')
    } else {
      // renderer 由 electron-vite 构建到 dist/renderer/，不在 modules-dist/
      const rendererPath = join(__dirname, '../../dist/renderer/index.html')
      console.log('[Live2D5] 🌐 加载文件:', rendererPath)
      await this.petWindow.loadFile(rendererPath, {
        hash: '#/live2d5-pet'
      })
      console.log('[Live2D5] ✅ 页面加载完成')
    }
  }

  /**
   * 关闭宠物窗口（通知 renderer 清理资源后再关闭）
   * 等待 renderer 完成清理，避免 WebGL 资源泄漏
   */
  private closePetWindow(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.petWindow || this.petWindow.isDestroyed()) {
        console.log('[Live2D5] 🔒 closePetWindow: 窗口已销毁，跳过')
        this.petWindow = null
        resolve()
        return
      }

      console.log('[Live2D5] 🔒 closePetWindow: 开始关闭流程...')

      // 设置超时：如果 renderer 3秒内没响应，强制关闭
      const timeout = setTimeout(() => {
        console.warn('[Live2D5] ⏰ renderer 清理超时，强制关闭窗口')
        this.forceClose()
        resolve()
      }, 3000)

      // 监听 renderer 端的清理完成确认
      const cleanupHandler = () => {
        clearTimeout(timeout)
        ipcMain.removeListener('live2d5:cleanup-done', cleanupHandler)
        this.forceClose()
        resolve()
      }
      ipcMain.on('live2d5:cleanup-done', cleanupHandler)

      // 通知 renderer 端开始清理
      try {
        this.petWindow.webContents.send('live2d5:destroy')
      } catch {
        // 发送失败，直接关闭
        clearTimeout(timeout)
        ipcMain.removeListener('live2d5:cleanup-done', cleanupHandler)
        this.forceClose()
        resolve()
      }
    })
  }

  /** 强制关闭窗口 */
  private forceClose(): void {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      try {
        this.petWindow.close()
      } catch {
        // 忽略关闭错误
      }
    }
    this.petWindow = null
  }
}
