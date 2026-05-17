/**
 * Electron 主进程 Mock 工厂
 * @description 模拟 BrowserWindow、app、ipcMain 等 Electron API
 */
import { vi } from 'vitest'

/** 创建 Mock BrowserWindow 实例 */
export function createMockBrowserWindow() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  return {
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    isVisible: vi.fn().mockReturnValue(true),
    getTitle: vi.fn().mockReturnValue('Test Window'),
    setTitle: vi.fn(),
    setSize: vi.fn(),
    getSize: vi.fn().mockReturnValue([1200, 800]),
    setPosition: vi.fn(),
    getPosition: vi.fn().mockReturnValue([100, 100]),
    setBounds: vi.fn(),
    getBounds: vi.fn().mockReturnValue({ x: 100, y: 100, width: 1200, height: 800 }),
    setMinimumSize: vi.fn(),
    setMaximumSize: vi.fn(),
    setResizable: vi.fn(),
    isMaximized: vi.fn().mockReturnValue(false),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    minimize: vi.fn(),
    isMinimized: vi.fn().mockReturnValue(false),
    setFullScreen: vi.fn(),
    isFullScreen: vi.fn().mockReturnValue(false),
    focus: vi.fn(),
    blur: vi.fn(),
    isFocused: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      openDevTools: vi.fn(),
      closeDevTools: vi.fn(),
      isDevToolsOpened: vi.fn().mockReturnValue(false),
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
      sendInputEvent: vi.fn(),
      setZoomFactor: vi.fn(),
      getZoomFactor: vi.fn().mockReturnValue(1),
      id: 1,
    },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    }),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    }),
    removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(handler)
    }),
    removeAllListeners: vi.fn((event?: string) => {
      if (event) {
        listeners.delete(event)
      } else {
        listeners.clear()
      }
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      listeners.get(event)?.forEach(handler => handler(...args))
    }),
  }
}

/** 创建 Mock IpcMain */
export function createMockIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  return {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    handleOnce: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    }),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    }),
    removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(handler)
    }),
    removeAllListeners: vi.fn((event?: string) => {
      if (event) {
        listeners.delete(event)
      } else {
        listeners.clear()
      }
    }),
    /** 测试辅助：获取已注册的 handler */
    _getHandler: (channel: string) => handlers.get(channel),
    /** 测试辅助：模拟渲染进程发送 invoke 请求 */
    _invoke: async (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel)
      if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
      return handler({ sender: { send: vi.fn() } }, ...args)
    },
  }
}

/** 创建完整的 Electron Mock 模块 */
export function createMockElectron() {
  const mockApp = {
    getPath: vi.fn((name: string) => {
      const paths: Record<string, string> = {
        userData: '/tmp/test-electron-userdata',
        temp: '/tmp',
        desktop: '/tmp/test-desktop',
        documents: '/tmp/test-documents',
        downloads: '/tmp/test-downloads',
        appData: '/tmp/test-appdata',
        home: '/tmp/test-home',
        exe: '/tmp/test-exe',
      }
      return paths[name] ?? `/tmp/test-${name}`
    }),
    getName: vi.fn().mockReturnValue('smart-desktop-assistant'),
    getVersion: vi.fn().mockReturnValue('0.1.0'),
    getAppPath: vi.fn().mockReturnValue('/tmp/test-app-path'),
    isReady: vi.fn().mockReturnValue(true),
    whenReady: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn(),
    exit: vi.fn(),
    relaunch: vi.fn(),
    isPackaged: false,
    requestSingleInstanceLock: vi.fn().mockReturnValue({ hasLock: true }),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  }

  const mockIpcMain = createMockIpcMain()
  const mockDialog = {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/test'] }),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: '/tmp/test-save' }),
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  }

  const mockShell = {
    openExternal: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(''),
    showItemInFolder: vi.fn(),
  }

  const mockNativeImage = {
    createFromPath: vi.fn().mockReturnValue({}),
    createFromBuffer: vi.fn().mockReturnValue({}),
    createEmpty: vi.fn().mockReturnValue({}),
  }

  return {
    app: mockApp,
    BrowserWindow: vi.fn().mockImplementation(() => createMockBrowserWindow()),
    ipcMain: mockIpcMain,
    ipcRenderer: {
      invoke: vi.fn(),
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
    },
    dialog: mockDialog,
    shell: mockShell,
    nativeImage: mockNativeImage,
    Menu: {
      buildFromTemplate: vi.fn().mockReturnValue({}),
      setApplicationMenu: vi.fn(),
    },
    Tray: vi.fn().mockImplementation(() => ({
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn(),
    })),
    Notification: vi.fn().mockImplementation(() => ({
      show: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    })),
    contextBridge: {
      exposeInMainWorld: vi.fn(),
    },
    powerMonitor: {
      on: vi.fn(),
      getSystemIdleTime: vi.fn().mockReturnValue(0),
    },
    screen: {
      getPrimaryDisplay: vi.fn().mockReturnValue({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        scaleFactor: 1,
      }),
      getAllDisplays: vi.fn().mockReturnValue([]),
    },
    net: {
      request: vi.fn(),
    },
    protocol: {
      registerFileProtocol: vi.fn(),
      registerHttpProtocol: vi.fn(),
    },
  }
}
