/**
 * Live2D Cubism 5 模块
 * 基于 Cubism 5 SDK for Web R5
 * 独立窗口运行，与旧版 Live2D 模块完全隔离
 *
 * 所有能力统一通过 getCapabilities() 暴露，不使用内部 IPC。
 */
console.debug('[Live2D5] 模块 index.ts 已加载')
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { BrowserWindow, ipcMain, app, dialog, protocol, net } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 宠物窗口默认尺寸 */
const PET_WINDOW_WIDTH = 400
const PET_WINDOW_HEIGHT = 500

/** 模型注册表条目 */
interface RegisteredModelEntry {
  name: string
  path: string
  applied: boolean
  addedAt: number
  version?: number
  textures?: number
  expressions?: number
  motions?: number
  motionGroups?: string[]
  hasPhysics?: boolean
  hasPose?: boolean
  scale?: number
}

export default class Live2D5Module implements Module {
  id = 'live2d-5'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private petWindow: import('electron').BrowserWindow | null = null
  private destroyResolve: (() => void) | null = null

  /** 模型注册表文件路径 */
  private getModelRegistryPath(): string {
    return join(app.getPath('userData'), 'live2d5-models.json')
  }

  /** 读取模型注册表 */
  private readModelRegistry(): RegisteredModelEntry[] {
    try {
      const filePath = this.getModelRegistryPath()
      if (existsSync(filePath)) {
        return JSON.parse(readFileSync(filePath, 'utf-8'))
      }
    } catch {}
    return []
  }

  /** 写入模型注册表 */
  private writeModelRegistry(models: RegisteredModelEntry[]): void {
    try {
      writeFileSync(this.getModelRegistryPath(), JSON.stringify(models, null, 2))
    } catch (err) {
      console.error('[Live2D5] 写入模型注册表失败:', err)
    }
  }

  /** 获取当前已应用的模型 */
  private getAppliedModel(): RegisteredModelEntry | null {
    return this.readModelRegistry().find(m => m.applied) ?? null
  }

  /** 自动注册 public 目录下的默认模型到模型库（仅首次启动时执行） */
  private registerDefaultModels(): void {
    try {
      const existing = this.readModelRegistry()

      // 迁移：老数据没有 applied 字段时，给第一个模型补上
      if (existing.length > 0 && !existing.some(m => m.applied !== undefined)) {
        existing[0].applied = true
        this.writeModelRegistry(existing)
        console.debug(`[Live2D5] 迁移：已为 "${existing[0].name}" 设置 applied: true`)
        return
      }

      if (existing.length > 0) return  // 已有数据，不重复注册

      const publicLive2dDir = join(app.getAppPath(), 'public', 'live2d')
      if (!existsSync(publicLive2dDir)) return

      const entries = readdirSync(publicLive2dDir, { withFileTypes: true })
      const models: RegisteredModelEntry[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const modelJsonPath = join(publicLive2dDir, entry.name, `${entry.name}.model3.json`)
        if (!existsSync(modelJsonPath)) continue

        let version = 0, textures = 0, expressions = 0, motions = 0
        let motionGroups: string[] = [], hasPhysics = false, hasPose = false
        try {
          const json = JSON.parse(readFileSync(modelJsonPath, 'utf-8'))
          const fileRefs = json.FileReferences ?? {}
          version = json.Version ?? 0
          textures = (fileRefs.Textures ?? []).length
          expressions = (fileRefs.Expressions ?? []).length
          motions = Object.values(fileRefs.Motions ?? {}).reduce(
            (sum: number, arr: unknown) => sum + (Array.isArray(arr) ? arr.length : 0), 0
          )
          motionGroups = Object.keys(fileRefs.Motions ?? {})
          hasPhysics = !!fileRefs.Physics
          hasPose = !!fileRefs.Pose
        } catch { /* 解析失败用默认值 */ }

        models.push({
          name: entry.name,
          path: `./live2d/${entry.name}/${entry.name}.model3.json`,
          applied: models.length === 0,  // 第一个模型默认已应用
          addedAt: Date.now(),
          version, textures, expressions, motions, motionGroups, hasPhysics, hasPose,
        })
      }

      if (models.length > 0) {
        this.writeModelRegistry(models)
        console.debug(`[Live2D5] 📦 自动注册 ${models.length} 个默认模型，已应用: ${models[0].name}`)
      }
    } catch (err) {
      console.error('[Live2D5] 注册默认模型失败:', err)
    }
  }

  /** 注册 local-file:// 自定义协议，让 renderer 能 fetch 本地绝对路径文件 */
  private registerLocalFileProtocol(): void {
    protocol.handle('local-file', (request) => {
      const filePath = decodeURIComponent(request.url.replace('local-file://', ''))
      // 安全检查：只允许读取存在的文件
      if (!existsSync(filePath)) {
        return new Response('File not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).href)
    })
    console.debug('[Live2D5] ✅ local-file:// 协议已注册')
  }

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.registerIPCHandlers()
    this.registerDefaultModels()
    this.registerLocalFileProtocol()
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

    // ★ 新增：获取实时状态（供管理页面刷新按钮使用）
    ipcMain.handle('live2d5_get_live_status', async () => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const result = await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.getLiveStatus?.() ?? null`
        ).catch(() => null)
        if (result) return { success: true, data: result }
      }
      return {
        success: true,
        data: {
          sdkLoaded: false, contextLost: false,
          mouseTracking: false, clickInteraction: false,
          currentExpression: '默认', currentMotion: '默认',
          lipSyncActive: false, bubbleText: '无',
        }
      }
    })

    // ★ 新增：获取 canvas 预览截图
    ipcMain.handle('live2d5_get_preview', async () => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const result = await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.getPreviewImage?.() ?? null`
        ).catch(() => null)
        return { success: true, data: result }
      }
      return { success: true, data: null }
    })

    // ★ 新增：获取动作队列状态
    ipcMain.handle('live2d5_get_motion_queue', async () => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const result = await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.getMotionQueueStatus?.() ?? null`
        ).catch(() => null)
        return { success: true, data: result }
      }
      return { success: true, data: null }
    })

    // ★ 新增：切换到麦克风输入（实时 LipSync）
    ipcMain.handle('live2d5_switch_to_microphone', async () => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const result = await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.switchToMicrophone?.() ?? false`
        ).catch(() => false)
        return { success: result }
      }
      return { success: false, error: '宠物窗口未打开' }
    })

    // ★ 新增：切换到 WAV 文件输入
    ipcMain.handle('live2d5_switch_to_wav', async (_event, args: { filePath: string }) => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.switchToWavFile?.("${args.filePath}")`
        ).catch(() => {})
        return { success: true }
      }
      return { success: false, error: '宠物窗口未打开' }
    })

    // ★ 新增：停止音频输入
    ipcMain.handle('live2d5_stop_audio', async () => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.stopAudio?.()`
        ).catch(() => {})
        return { success: true }
      }
      return { success: false, error: '宠物窗口未打开' }
    })

    // ★ 新增：获取音频输入类型
    ipcMain.handle('live2d5_get_audio_type', async () => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const result = await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.getAudioInputType?.() ?? 'none'`
        ).catch(() => 'none')
        return { success: true, data: result }
      }
      return { success: true, data: 'none' }
    })

    // ★ 新增：设置目标帧率
    ipcMain.handle('live2d5_set_fps', async (_event, args: { fps: number }) => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.setTargetFPS?.(${args.fps})`
        ).catch(() => {})
        return { success: true }
      }
      return { success: false, error: '宠物窗口未打开' }
    })

    // ★ 新增：获取当前目标帧率
    ipcMain.handle('live2d5_get_fps', async () => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const result = await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.getTargetFPS?.() ?? 60`
        ).catch(() => 60)
        return { success: true, data: result }
      }
      return { success: true, data: 60 }
    })

    // ★ 新增：设置对话气泡文本
    ipcMain.handle('live2d5_set_bubble', async (_event, args: { text: string | null }) => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.setBubbleText?.(${JSON.stringify(args.text)})`
        ).catch(() => {})
        return { success: true }
      }
      return { success: false, error: '宠物窗口未打开' }
    })

    // ★ 新增：获取对话气泡文本
    ipcMain.handle('live2d5_get_bubble', async () => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const result = await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.getBubbleText?.() ?? null`
        ).catch(() => null)
        return { success: true, data: result }
      }
      return { success: true, data: null }
    })

    // ★ 新增：扫描指定目录下的 model3.json 文件
    ipcMain.handle('live2d5_scan_model', async (_event, args: { dirPath: string }) => {
      try {
        const { dirPath } = args
        const fs = await import('fs')
        const path = await import('path')

        // 检查目录是否存在
        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
          return { success: false, error: '目录不存在或不是有效目录' }
        }

        // 递归扫描 model3.json 文件（最多递归 3 层）
        const modelFiles: string[] = []
        const scanDir = (dir: string, depth: number) => {
          if (depth > 3) return
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name)
              if (entry.isFile() && entry.name.endsWith('.model3.json')) {
                modelFiles.push(fullPath)
              } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                scanDir(fullPath, depth + 1)
              }
            }
          } catch { /* 忽略无权限目录 */ }
        }
        scanDir(dirPath, 0)

        if (modelFiles.length === 0) {
          return { success: false, error: '该目录下未找到 model3.json 文件' }
        }

        // 读取每个 model3.json 的基本信息
        const models = modelFiles.map(filePath => {
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            const json = JSON.parse(content)
            const fileRefs = json.FileReferences ?? {}
            const modelName = path.basename(path.dirname(filePath))

            return {
              name: modelName,
              path: filePath,
              version: json.Version ?? 0,
              textures: (fileRefs.Textures ?? []).length,
              expressions: (fileRefs.Expressions ?? []).length,
              motions: Object.values(fileRefs.Motions ?? {}).reduce(
                (sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0
              ),
              motionGroups: Object.keys(fileRefs.Motions ?? {}),
              hasPhysics: !!fileRefs.Physics,
              hasPose: !!fileRefs.Pose,
            }
          } catch {
            return { name: path.basename(filePath), path: filePath, error: '解析失败' }
          }
        })

        return { success: true, data: models }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })

    // ★ 打开文件夹选择对话框
    ipcMain.handle('live2d5_select_directory', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择模型目录',
        message: '选择包含 Live2D 模型的文件夹'
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true }
      }
      return { success: true, filePath: result.filePaths[0] }
    })

    // ★ 新增：重新加载当前模型
    ipcMain.handle('live2d5_reload_model', async () => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const result = await this.petWindow.webContents.executeJavaScript(
          `window.__cubism5Service?.reloadModel?.() ?? false`
        ).catch(() => false)
        return { success: result }
      }
      return { success: false, error: '宠物窗口未打开' }
    })

    // ★ 新增：设置模型缩放（持久化到模型注册表）
    ipcMain.handle('live2d5_set_scale', async (_event, args: { path: string; scale: number }) => {
      try {
        const registry = this.readModelRegistry()
        const target = registry.find(m => m.path === args.path)
        if (!target) return { success: false, error: '模型未找到' }
        target.scale = Math.max(0.1, Math.min(3.0, args.scale))
        this.writeModelRegistry(registry)
        return { success: true, scale: target.scale }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })

    // ★ 获取已注册模型列表（模型库）
    ipcMain.handle('live2d5_get_registered_models', async () => {
      return { success: true, data: this.readModelRegistry() }
    })

    // ★ 获取当前已应用的模型（从注册表读取，相对路径自动解析为 file:// URL）
    ipcMain.handle('live2d5_get_applied_model', async () => {
      const model = this.getAppliedModel()
      if (model && model.path) {
        let absolutePath: string
        if (model.path.startsWith('/') || model.path.match(/^[A-Za-z]:\\/)) {
          absolutePath = model.path
        } else {
          absolutePath = join(app.getAppPath(), model.path)
        }
        // 转为 file:// URL，renderer 可直接 fetch，无需自定义协议
        const fileUrl = pathToFileURL(absolutePath).href
        return { success: true, data: { ...model, path: fileUrl } }
      }
      return { success: true, data: model }
    })

    // ★ 注册模型（添加到模型库，默认未应用）
    ipcMain.handle('live2d5_register_models', async (_event, args: { models: Array<{ name: string; path: string; version?: number; textures?: number; expressions?: number; motions?: number; motionGroups?: string[]; hasPhysics?: boolean; hasPose?: boolean }> }) => {
      try {
        const existing = this.readModelRegistry()
        const existingPaths = new Set(existing.map(m => m.path))
        const newModels: RegisteredModelEntry[] = args.models
          .filter(m => !existingPaths.has(m.path))
          .map(m => ({ ...m, applied: false, addedAt: Date.now() }))
        const updated = [...existing, ...newModels]
        this.writeModelRegistry(updated)
        return { success: true, data: updated, added: newModels.length }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })

    // ★ 应用模型（设置为已应用，需先关闭宠物窗口）
    ipcMain.handle('live2d5_apply_model', async (_event, args: { path: string }) => {
      try {
        // 检查宠物窗口是否运行中
        if (this.petWindow && !this.petWindow.isDestroyed()) {
          return { success: false, error: '宠物窗口运行中，请先关闭窗口再切换模型' }
        }

        const registry = this.readModelRegistry()
        const target = registry.find(m => m.path === args.path)
        if (!target) return { success: false, error: '模型未找到' }

        // 切换 applied 标记
        const updated = registry.map(m => ({ ...m, applied: m.path === args.path }))
        this.writeModelRegistry(updated)
        return { success: true, data: updated }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })

    // ★ 注销模型（从模型库移除，已应用的不能移除）
    ipcMain.handle('live2d5_unregister_model', async (_event, args: { path: string }) => {
      try {
        const registry = this.readModelRegistry()
        const target = registry.find(m => m.path === args.path)
        if (target?.applied) {
          return { success: false, error: '不能移除已应用的模型，请先切换到其他模型' }
        }
        const updated = registry.filter(m => m.path !== args.path)
        this.writeModelRegistry(updated)
        return { success: true, data: updated }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
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
    ipcMain.removeHandler('live2d5_get_live_status')
    ipcMain.removeHandler('live2d5_get_preview')
    ipcMain.removeHandler('live2d5_get_motion_queue')
    ipcMain.removeHandler('live2d5_switch_to_microphone')
    ipcMain.removeHandler('live2d5_switch_to_wav')
    ipcMain.removeHandler('live2d5_stop_audio')
    ipcMain.removeHandler('live2d5_get_audio_type')
    ipcMain.removeHandler('live2d5_set_fps')
    ipcMain.removeHandler('live2d5_get_fps')
    ipcMain.removeHandler('live2d5_set_bubble')
    ipcMain.removeHandler('live2d5_get_bubble')
    ipcMain.removeHandler('live2d5_scan_model')
    ipcMain.removeHandler('live2d5_select_directory')
    ipcMain.removeHandler('live2d5_reload_model')
    ipcMain.removeHandler('live2d5_get_registered_models')
    ipcMain.removeHandler('live2d5_get_applied_model')
    ipcMain.removeHandler('live2d5_register_models')
    ipcMain.removeHandler('live2d5_apply_model')
    ipcMain.removeHandler('live2d5_unregister_model')
    ipcMain.removeHandler('live2d5_set_scale')
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
      },
      {
        type: 'tool',
        name: 'live2d5_get_live_status',
        description: '获取 Live2D 5 宠物实时运行状态',
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
                `window.__cubism5Service?.getLiveStatus?.() ?? null`
              ).catch(() => null)
              if (result) return { success: true, data: result }
            }
            return {
              success: true,
              data: {
                sdkLoaded: false, contextLost: false,
                mouseTracking: false, clickInteraction: false,
                currentExpression: '默认', currentMotion: '默认',
                lipSyncActive: false, bubbleText: '无',
              }
            }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_get_preview',
        description: '获取 Live2D 5 宠物窗口预览截图',
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
                `window.__cubism5Service?.getPreviewImage?.() ?? null`
              ).catch(() => null)
              return { success: true, data: result }
            }
            return { success: true, data: null }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_scan_model',
        description: '扫描指定目录下的 Live2D5 模型文件（model3.json）',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            dirPath: { type: 'string', description: '要扫描的目录路径' }
          },
          required: ['dirPath']
        },
        handler: {
          execute: async (p) => {
            const { dirPath } = p as { dirPath: string }
            try {
              const fs = await import('fs')
              const path = await import('path')

              if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
                return { success: false, error: '目录不存在或不是有效目录' }
              }

              const modelFiles: string[] = []
              const scanDir = (dir: string, depth: number) => {
                if (depth > 3) return
                try {
                  const entries = fs.readdirSync(dir, { withFileTypes: true })
                  for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name)
                    if (entry.isFile() && entry.name.endsWith('.model3.json')) {
                      modelFiles.push(fullPath)
                    } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                      scanDir(fullPath, depth + 1)
                    }
                  }
                } catch { /* 忽略无权限目录 */ }
              }
              scanDir(dirPath, 0)

              if (modelFiles.length === 0) {
                return { success: false, error: '该目录下未找到 model3.json 文件' }
              }

              const models = modelFiles.map(filePath => {
                try {
                  const content = fs.readFileSync(filePath, 'utf-8')
                  const json = JSON.parse(content)
                  const fileRefs = json.FileReferences ?? {}
                  const modelName = path.basename(path.dirname(filePath))
                  return {
                    name: modelName,
                    path: filePath,
                    version: json.Version ?? 0,
                    textures: (fileRefs.Textures ?? []).length,
                    expressions: (fileRefs.Expressions ?? []).length,
                    motions: Object.values(fileRefs.Motions ?? {}).reduce(
                      (sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0
                    ),
                    motionGroups: Object.keys(fileRefs.Motions ?? {}),
                    hasPhysics: !!fileRefs.Physics,
                    hasPose: !!fileRefs.Pose,
                  }
                } catch {
                  return { name: path.basename(filePath), path: filePath, error: '解析失败' }
                }
              })

              return { success: true, data: models }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_apply_model',
        description: '应用指定模型（需先关闭宠物窗口）',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '模型文件路径' }
          },
          required: ['path']
        },
        handler: {
          execute: async (p) => {
            const { path: modelPath } = p as { path: string }
            if (this.petWindow && !this.petWindow.isDestroyed()) {
              return { success: false, error: '宠物窗口运行中，请先关闭窗口再切换模型' }
            }
            const registry = this.readModelRegistry()
            const target = registry.find(m => m.path === modelPath)
            if (!target) return { success: false, error: '模型未找到' }
            const updated = registry.map(m => ({ ...m, applied: m.path === modelPath }))
            this.writeModelRegistry(updated)
            return { success: true, data: updated }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_get_applied_model',
        description: '获取当前已应用的模型信息',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: {
          execute: async () => {
            const model = this.getAppliedModel()
            if (model && model.path) {
              let absolutePath: string
              if (model.path.startsWith('/') || model.path.match(/^[A-Za-z]:\\/)) {
                absolutePath = model.path
              } else {
                absolutePath = join(app.getAppPath(), model.path)
              }
              const fileUrl = pathToFileURL(absolutePath).href
              return { success: true, data: { ...model, path: fileUrl } }
            }
            return { success: true, data: model }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_select_directory',
        description: '打开文件夹选择对话框，选择包含 Live2D 模型的目录',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: {
          execute: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openDirectory'],
              title: '选择模型目录',
              message: '选择包含 Live2D 模型的文件夹'
            })
            if (result.canceled || result.filePaths.length === 0) {
              return { success: false, canceled: true }
            }
            return { success: true, filePath: result.filePaths[0] }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_reload_model',
        description: '重新加载当前 Live2D 5 模型（用于模型异常时恢复）',
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
                `window.__cubism5Service?.reloadModel?.() ?? false`
              ).catch(() => false)
              return { success: result }
            }
            return { success: false, error: '宠物窗口未打开' }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_get_registered_models',
        description: '获取已注册的模型库列表（持久化存储）',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: {
          execute: async () => {
            return { success: true, data: this.readModelRegistry() }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_register_models',
        description: '批量注册模型到模型库（持久化存储）',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            models: {
              type: 'array',
              description: '要注册的模型列表',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: '模型名称' },
                  path: { type: 'string', description: '模型文件路径' },
                  version: { type: 'number', description: '模型版本' },
                  textures: { type: 'number', description: '贴图数量' },
                  expressions: { type: 'number', description: '表情数量' },
                  motions: { type: 'number', description: '动作数量' },
                  motionGroups: { type: 'array', items: { type: 'string' }, description: '动作组列表' },
                  hasPhysics: { type: 'boolean', description: '是否有物理演算' },
                  hasPose: { type: 'boolean', description: '是否有姿态' }
                }
              }
            }
          },
          required: ['models']
        },
        handler: {
          execute: async (p) => {
            const { models } = p as { models: Array<{ name: string; path: string; version?: number; textures?: number; expressions?: number; motions?: number; motionGroups?: string[]; hasPhysics?: boolean; hasPose?: boolean }> }
            try {
              const existing = this.readModelRegistry()
              const existingPaths = new Set(existing.map(m => m.path))
              const newModels = models
                .filter(m => !existingPaths.has(m.path))
                .map(m => ({ ...m, applied: false, addedAt: Date.now() }))
              const updated = [...existing, ...newModels]
              this.writeModelRegistry(updated)
              return { success: true, data: updated, added: newModels.length }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_set_scale',
        description: '设置 Live2D 5 模型缩放比例（持久化）',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '模型文件路径' },
            scale: { type: 'number', description: '缩放比例 (0.1~3.0)' }
          },
          required: ['path', 'scale']
        },
        handler: {
          execute: async (p) => {
            const { path: modelPath, scale } = p as { path: string; scale: number }
            try {
              const registry = this.readModelRegistry()
              const target = registry.find(m => m.path === modelPath)
              if (!target) return { success: false, error: '模型未找到' }
              target.scale = Math.max(0.1, Math.min(3.0, scale))
              this.writeModelRegistry(registry)
              return { success: true, scale: target.scale }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_unregister_model',
        description: '从模型库移除指定模型',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '要移除的模型文件路径' }
          },
          required: ['path']
        },
        handler: {
          execute: async (p) => {
            const { path: modelPath } = p as { path: string }
            try {
              const existing = this.readModelRegistry()
              const target = existing.find(m => m.path === modelPath)
              if (target?.applied) {
                return { success: false, error: '不能移除已应用的模型，请先切换到其他模型' }
              }
              const updated = existing.filter(m => m.path !== modelPath)
              this.writeModelRegistry(updated)
              return { success: true, data: updated }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_set_bubble',
        description: '设置 Live2D 5 宠物对话气泡文本（null 清除）',
        priority: 10,
        moduleId: this.id,
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '气泡文本，null 或空字符串清除' }
          },
          required: ['text']
        },
        handler: {
          execute: async (p) => {
            const { text } = p as { text: string }
            if (this.petWindow && !this.petWindow.isDestroyed()) {
              await this.petWindow.webContents.executeJavaScript(
                `window.__cubism5Service?.setBubbleText?.(${JSON.stringify(text || null)})`
              ).catch(() => {})
              return { success: true }
            }
            return { success: false, error: '宠物窗口未打开' }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_get_audio_type',
        description: '获取当前音频输入类型（microphone/wav/none）',
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
                `window.__cubism5Service?.getAudioInputType?.() ?? 'none'`
              ).catch(() => 'none')
              return { success: true, data: result }
            }
            return { success: true, data: 'none' }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_switch_to_microphone',
        description: '切换到麦克风输入（实时 LipSync）',
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
                `window.__cubism5Service?.switchToMicrophone?.() ?? false`
              ).catch(() => false)
              return { success: result }
            }
            return { success: false, error: '宠物窗口未打开' }
          }
        }
      },
      {
        type: 'tool',
        name: 'live2d5_stop_audio',
        description: '停止所有音频输入',
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
              await this.petWindow.webContents.executeJavaScript(
                `window.__cubism5Service?.stopAudio?.()`
              ).catch(() => {})
              return { success: true }
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

    console.debug('[Live2D5] 🪟 开始创建宠物窗口...')

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
      console.debug('[Live2D5] ✅ renderer 页面 did-finish-load')
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
      console.debug('[Live2D5] ✅ renderer 进程恢复响应')
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
      console.debug('[Live2D5] 🪟 宠物窗口已关闭')
      ipcMain.removeListener('live2d5:cleanup-done', cleanupHandler)
      this.petWindow = null
      // 如果有 deactivate 等待的 resolve，调用它
      if (this.destroyResolve) {
        this.destroyResolve()
        this.destroyResolve = null
      }
    })

    // 加载独立的 Live2D 5 页面（独立 renderer，不会与旧 SDK 冲突）
    console.debug('[Live2D5] 🌐 VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL ?? '(undefined)')
    if (process.env.VITE_DEV_SERVER_URL) {
      const url = `${process.env.VITE_DEV_SERVER_URL}#/live2d5-pet`
      console.debug('[Live2D5] 🌐 加载 URL:', url)
      await this.petWindow.loadURL(url)
      console.debug('[Live2D5] ✅ 页面加载完成')
    } else {
      // renderer 由 electron-vite 构建到 dist/renderer/，不在 modules-dist/
      const rendererPath = join(__dirname, '../../dist/renderer/index.html')
      console.debug('[Live2D5] 🌐 加载文件:', rendererPath)
      await this.petWindow.loadFile(rendererPath, {
        hash: '#/live2d5-pet'
      })
      console.debug('[Live2D5] ✅ 页面加载完成')
    }
  }

  /**
   * 关闭宠物窗口（通知 renderer 清理资源后再关闭）
   * 等待 renderer 完成清理，避免 WebGL 资源泄漏
   */
  private closePetWindow(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.petWindow || this.petWindow.isDestroyed()) {
        console.debug('[Live2D5] 🔒 closePetWindow: 窗口已销毁，跳过')
        this.petWindow = null
        resolve()
        return
      }

      console.debug('[Live2D5] 🔒 closePetWindow: 开始关闭流程...')

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
