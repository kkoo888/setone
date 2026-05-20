import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

// Windows 控制台 UTF-8 编码，防止中文日志乱码
if (process.platform === 'win32') {
  try {
    // chcp 65001 设置控制台代码页为 UTF-8
    // 用 shell 执行确保生效；Electron 主进程没有自己的控制台窗口，
    // 所以需要通过父进程的控制台生效
    execSync('chcp 65001', { stdio: 'ignore', shell: 'cmd.exe' })
  } catch {}
  // 同时设置 stdout/stderr 编码
  if (process.stdout.setDefaultEncoding) process.stdout.setDefaultEncoding('utf-8')
  if (process.stderr.setDefaultEncoding) process.stderr.setDefaultEncoding('utf-8')
}

import { createAppMenu } from './menu'
import { registerAllIpcHandlers } from './ipc-handlers'
import { ConfigManagerImpl } from './core/config-manager'
import { AppLogger } from './core/logger'
import { GlobalEventBus } from './core/event-bus'
import { OllamaAIService } from './core/ai-service'
import { DatabaseManager } from './core/database'
import { ModuleManager } from './core/module-manager'
import { PerformanceMonitor } from './core/performance-monitor'
import { createTray, handleWindowClose, destroyTray } from './tray'
import { SoulManager } from './core/soul-manager'

let mainWindow: BrowserWindow | null = null

/**
 * 获取模块目录路径
 * 优先使用 ncc 编译后的 modules-dist，回退到源码 modules
 */
function getModulesPath(): string {
  if (!app.isPackaged) {
    // 开发模式：优先用编译后的 modules-dist
    const compiledDir = join(__dirname, '../../modules-dist')
    const sourceDir = join(__dirname, '../../modules')
    if (existsSync(compiledDir)) {
      return compiledDir
    }
    return sourceDir
  }

  // 打包模式：优先用编译后的 modules-dist（JS），回退到 modules（TS）
  const packagedCompiled = join(app.getAppPath(), 'modules-dist')
  const packagedSource = join(app.getAppPath(), 'modules')
  if (existsSync(packagedCompiled)) {
    return packagedCompiled
  }
  return packagedSource
}

function createWindow(config: ConfigManagerImpl | null): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    show: false
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[Main] 页面加载失败: ${errorCode} - ${errorDescription}`)
    mainWindow!.show()
  })

  if (config) {
    mainWindow.on('close', (event) => {
      void handleWindowClose(event, mainWindow!, config)
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * 应用主入口
 * 先创建窗口，再初始化后台服务
 */
app.whenReady().then(async () => {
  // ===== 第一阶段：确保窗口一定创建 =====
  let config: ConfigManagerImpl | null = null

  try {
    config = new ConfigManagerImpl()

    // 初始化 SOUL 系统（检查本地配置或继承 SOUL.md）
    const soulManager = SoulManager.getInstance()
    const soulStatus = soulManager.initialize()
    console.log(`[Main] SOUL 状态: ${soulStatus}`)

    // 从 SOUL 读取助手名称，写入配置
    const existingName = await config.get<string>('appSettings.assistantName')
    if (!existingName) {
      const soul = soulManager.getSoul()
      if (soul?.name) {
        const appSettings = await config.get<Record<string, unknown>>('appSettings', {})
        await config.set('appSettings', { ...appSettings, assistantName: soul.name })
        console.log(`[Main] 从 SOUL 读取助手名称: ${soul.name}`)
      }
    }

    createWindow(config)
  } catch (err) {
    console.error('[Main] 窗口创建失败:', err)
    if (!mainWindow) createWindow(null)
  }

  // ===== 第二阶段：初始化后台服务（失败不影响窗口） =====
  try {
    const logger = new AppLogger('main', 'info')
    if (!config) config = new ConfigManagerImpl()

    const eventBus = new GlobalEventBus()
    const aiService = new OllamaAIService(config, logger)

    // 数据库初始化（better-sqlite3 原生模块，可能因 ABI 不匹配失败）
    let db: DatabaseManager | null = null
    try {
      db = new DatabaseManager(logger)
    } catch (dbErr) {
      console.error('[Main] 数据库初始化失败:', dbErr)
      logger.error('数据库初始化失败，应用无法启动', dbErr as Error)
      throw dbErr
    }

    const modulesPath = getModulesPath()
    const moduleManager = new ModuleManager(eventBus, config, aiService, db as DatabaseManager, modulesPath)

    const performanceMonitor = new PerformanceMonitor()

    try {
      await moduleManager.initialize()
      logger.info('模块加载完成')
    } catch (err) {
      logger.error('模块初始化失败', err as Error)
    }

    performanceMonitor.start()

    registerAllIpcHandlers({ config, logger, eventBus, aiService, db: db as DatabaseManager, moduleManager, performanceMonitor })
    createAppMenu()
    createTray(() => mainWindow, config!)

    logger.info('应用启动完成')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Main] 后台服务初始化失败:', err)
    if (mainWindow) {
      void dialog.showErrorBox('启动警告', `部分服务初始化失败：\n\n${msg}`)
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(config)
    }
  })
}).catch((err) => {
  console.error('[Main] 应用启动致命错误:', err)
  void dialog.showErrorBox('启动失败', `应用启动时发生致命错误：\n\n${err instanceof Error ? err.message : String(err)}`)
})

app.on('window-all-closed', () => {
  destroyTray()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

process.on('uncaughtException', (err) => {
  console.error('[Main] 未捕获异常:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Main] 未处理的 Promise 拒绝:', reason)
})
