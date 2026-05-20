/**
 * Live2D 桌面宠物窗口 IPC 处理器
 * live2d:create-window / live2d:close-window / live2d:toggle-visibility
 * live2d:set-ignore-mouse / live2d:start-drag / live2d:get-bounds
 * live2d:set-size / live2d:set-position
 *
 * Live2D5 宠物窗口 IPC 处理器
 * live2d5_open / live2d5_close / live2d5_status
 * live2d5:request-drag / live2d5:destroy / live2d5:set-expression / live2d5:play-motion
 */
import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registeredModuleIpc } from './module.handlers'
import type { HandlerDeps } from './types'

/** Live2D 宠物窗口引用 */
let live2dWindow: BrowserWindow | null = null

/** Live2D5 宠物窗口引用 */
let live2d5Window: BrowserWindow | null = null

/**
 * 注册 Live2D 相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerLive2dHandlers(deps: HandlerDeps): void {
  const { logger } = deps

  registeredModuleIpc.add('live2d:create-window')
  registeredModuleIpc.add('live2d:close-window')
  registeredModuleIpc.add('live2d:toggle-visibility')
  registeredModuleIpc.add('live2d:set-ignore-mouse')
  registeredModuleIpc.add('live2d:start-drag')
  registeredModuleIpc.add('live2d:get-bounds')
  registeredModuleIpc.add('live2d:set-size')
  registeredModuleIpc.add('live2d:set-position')

  /**
   * 创建 Live2D 透明窗口
   * 透明、无边框、可穿透点击、置顶
   */
  ipcMain.handle('live2d:create-window', async () => {
    if (live2dWindow && !live2dWindow.isDestroyed()) {
      live2dWindow.focus()
      return true
    }

    live2dWindow = new BrowserWindow({
      width: 300,
      height: 400,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    })

    // 初始关闭鼠标穿透，等模型加载完成后由渲染进程动态控制
    live2dWindow.setIgnoreMouseEvents(false)

    // 开发模式加载 dev server，生产模式加载文件
    if (process.env.VITE_DEV_SERVER_URL) {
      live2dWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/live2d-pet`)
    } else {
      live2dWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '#/live2d-pet',
      })
    }

    // 注意：不在这里开启鼠标穿透，由渲染进程根据鼠标是否在模型上来动态控制
    // 解决鼠标穿透导致无法点击宠物的问题

    // 页面加载失败时记录日志
    live2dWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      logger.error(`[Live2D] 页面加载失败: ${errorCode} - ${errorDescription}`)
    })

    live2dWindow.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) { // warn 或 error
        logger.warn(`[Live2D] ${message}`)
      }
    })

    live2dWindow.on('closed', () => {
      live2dWindow = null
    })

    return true
  })

  /** 关闭 Live2D 宠物窗口 */
  ipcMain.handle('live2d:close-window', async () => {
    if (live2dWindow && !live2dWindow.isDestroyed()) {
      live2dWindow.close()
      live2dWindow = null
    }
    return true
  })

  /** 切换 Live2D 窗口可见性 */
  ipcMain.handle('live2d:toggle-visibility', async () => {
    if (!live2dWindow || live2dWindow.isDestroyed()) {
      return false
    }

    if (live2dWindow.isVisible()) {
      live2dWindow.hide()
      return false
    }
    live2dWindow.show()
    return true
  })

  /** 开启/关闭鼠标穿透（拖拽模式切换） */
  ipcMain.handle('live2d:set-ignore-mouse', async (_event, _ignore: boolean) => {
    // 不再使用鼠标穿透，窗口始终接收鼠标事件，确保拖拽可靠
    return true
  })

  /** 开始窗口拖拽（无边框窗口拖拽移动） */
  ipcMain.handle('live2d:start-drag', async () => {
    if (!live2dWindow || live2dWindow.isDestroyed()) return
    // 使用 Electron 内置的窗口拖拽 API
    live2dWindow.webContents.sendInputEvent({
      type: 'mouseDown',
      x: 0,
      y: 0,
      button: 'left',
      clickCount: 1,
    })
  })

  /** 获取窗口位置和大小 */
  ipcMain.handle('live2d:get-bounds', async () => {
    if (!live2dWindow || live2dWindow.isDestroyed()) return null
    return live2dWindow.getBounds()
  })

  /** 设置窗口大小 */
  ipcMain.handle('live2d:set-size', async (_event, args: { width: number; height: number }) => {
    if (!live2dWindow || live2dWindow.isDestroyed()) return
    const [x, y] = live2dWindow.getPosition()
    live2dWindow.setBounds({ x, y, width: Math.max(150, args.width), height: Math.max(200, args.height) })
    return true
  })

  /** 设置窗口位置 */
  ipcMain.handle('live2d:set-position', async (_event, args: { x: number; y: number }) => {
    if (!live2dWindow || live2dWindow.isDestroyed()) return
    live2dWindow.setPosition(args.x, args.y)
    return true
  })

  // ============ Live2D5 宠物窗口 IPC ============

  registeredModuleIpc.add('live2d5_open')
  registeredModuleIpc.add('live2d5_close')
  registeredModuleIpc.add('live2d5_status')
  registeredModuleIpc.add('live2d5:request-drag')
  registeredModuleIpc.add('live2d5:destroy')

  /** 打开 Live2D5 宠物窗口 */
  ipcMain.handle('live2d5_open', async () => {
    if (live2d5Window && !live2d5Window.isDestroyed()) {
      live2d5Window.focus()
      return { success: true }
    }

    live2d5Window = new BrowserWindow({
      width: 400,
      height: 500,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    })

    live2d5Window.setIgnoreMouseEvents(false)

    if (process.env.VITE_DEV_SERVER_URL) {
      live2d5Window.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/live2d5-pet`)
    } else {
      live2d5Window.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '#/live2d5-pet',
      })
    }

    live2d5Window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      logger.error(`[Live2D5] 页面加载失败: ${errorCode} - ${errorDescription}`)
    })

    live2d5Window.on('closed', () => {
      live2d5Window = null
    })

    return { success: true }
  })

  /** 关闭 Live2D5 宠物窗口 */
  ipcMain.handle('live2d5_close', async () => {
    if (live2d5Window && !live2d5Window.isDestroyed()) {
      live2d5Window.close()
      live2d5Window = null
    }
    return { success: true }
  })

  /** 获取 Live2D5 窗口状态 */
  ipcMain.handle('live2d5_status', async () => {
    return {
      success: true,
      data: { windowOpen: live2d5Window && !live2d5Window.isDestroyed() }
    }
  })

  /** Live2D5 窗口拖拽 */
  ipcMain.handle('live2d5:request-drag', async () => {
    if (!live2d5Window || live2d5Window.isDestroyed()) return
    // 使用 Electron 内置的窗口拖拽移动
    const [x, y] = live2d5Window.getPosition()
    live2d5Window.setPosition(x, y) // 触发一次位置更新
    // 通过 webContents 发送鼠标事件实现拖拽
    live2d5Window.webContents.sendInputEvent({
      type: 'mouseDown',
      x: 0,
      y: 0,
      button: 'left',
      clickCount: 1,
    })
  })

  /** Live2D5 窗口销毁通知 */
  ipcMain.handle('live2d5:destroy', async () => {
    if (live2d5Window && !live2d5Window.isDestroyed()) {
      live2d5Window.close()
      live2d5Window = null
    }
  })
}
