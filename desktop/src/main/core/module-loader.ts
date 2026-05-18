import { existsSync } from 'fs'
import { join, isAbsolute } from 'path'
import { pathToFileURL } from 'url'
import { app } from 'electron'
import type { Module, ModuleContext, ModuleRegistration, ModuleMeta } from '../types/module'
import type { EventBus } from '../types/event'
import type { Logger } from '../types/logger'
import type { ConfigManager } from '../types/config'
import type { AIService } from '../types/ai'
import type { DatabaseManager } from '../types/database'
import type { ScopedStore } from '../types/store'
import { createScopedEventBus } from './scoped-event-bus'
import { createLogger } from './logger'
import { pollingRegistry } from './polling-registry'

/** deactivate 默认超时时间（ms） */
const DEFAULT_DEACTIVATE_TIMEOUT_MS = 5000
/** activate 默认超时时间（ms） */
const DEFAULT_ACTIVATE_TIMEOUT_MS = 10000

/**
 * 模块加载器
 * 负责模块的注册、激活、停用、注销等生命周期管理
 *
 * @author 小茜
 * @date 2026-05-15
 */
export class ModuleLoader {
  private modules = new Map<string, ModuleRegistration>()
  private logger: Logger
  private deactivateTimeoutMs: number
  private activateTimeoutMs: number
  private skillSearchPaths: string[]

  constructor(
    private eventBus: EventBus,
    private config: ConfigManager,
    private ai: AIService,
    private db: DatabaseManager,
    logger: Logger,
    options?: { deactivateTimeoutMs?: number; activateTimeoutMs?: number; skillSearchPaths?: string[] }
  ) {
    this.logger = logger
    this.deactivateTimeoutMs = options?.deactivateTimeoutMs ?? DEFAULT_DEACTIVATE_TIMEOUT_MS
    this.activateTimeoutMs = options?.activateTimeoutMs ?? DEFAULT_ACTIVATE_TIMEOUT_MS
    this.skillSearchPaths = options?.skillSearchPaths ?? []
  }

  /**
   * 解析模块入口文件路径
   * 优先加载编译后的 .js（生产环境），其次 .ts（开发环境）
   */
  private resolveEntryPath(modulePath: string): string {
    const jsPath = join(modulePath, 'index.js')
    const tsPath = join(modulePath, 'index.ts')

    console.log(`[ModuleLoader] resolveEntryPath - \u68c0\u67e5: js=${existsSync(jsPath)}, ts=${existsSync(tsPath)}`)

    if (existsSync(jsPath)) return jsPath
    if (existsSync(tsPath)) return tsPath
    throw new Error(`模块入口文件不存在: ${jsPath} 或 ${tsPath}`)
  }

  /**
   * 动态加载模块入口文件
   */
  private async loadModuleEntry(entryPath: string): Promise<Record<string, unknown>> {
    if (entryPath.endsWith('.ts')) {
      this.logger.warn(
        `正在加载 .ts 源文件: ${entryPath}。生产环境应使用编译后的 .js 文件。`
      )
    }
    console.log(`[ModuleLoader] \u52a8\u6001 import: ${entryPath}`)
    try {
      // Windows 绝对路径 (C:\...) 必须转为 file:// URL，否则 ESM loader 报 ERR_UNSUPPORTED_ESM_URL_SCHEME
      const importTarget = isAbsolute(entryPath) ? pathToFileURL(entryPath).href : entryPath
      console.log(`[ModuleLoader] import target: ${importTarget}`)
      const exports = await import(importTarget)
      console.log(`[ModuleLoader] import \u6210\u529f\uff0cexport \u6570\u91cf: ${Object.keys(exports).length}, keys: [${Object.keys(exports).join(', ')}]`)
      return exports
    } catch (importErr) {
      console.error(`[ModuleLoader] \u274c import \u5931\u8d25: ${entryPath}`)
      console.error(`  \u9519\u8bef: ${(importErr as Error).message}`)
      console.error(`  \u5806\u6808: ${(importErr as Error).stack}`)
      throw importErr
    }
  }

  /** 注册模块 */
  register(meta: ModuleMeta, path: string, hash: string): void {
    this.modules.set(meta.id, {
      meta,
      instance: null,
      status: 'discovered',
      hash,
      path
    })
    this.logger.info(`模块已注册: ${meta.id}`)
  }

  /** 注销模块（从注册表移除，调用前需先 deactivate） */
  unregister(moduleId: string): boolean {
    const reg = this.modules.get(moduleId)
    if (!reg) return false

    if (reg.status === 'active') {
      this.logger.warn(`模块 "${moduleId}" 仍在活跃状态，请先调用 deactivate`)
      return false
    }

    this.modules.delete(moduleId)
    this.logger.info(`模块已注销: ${moduleId}`)
    return true
  }

  /** 加载并激活模块 */
  async activate(moduleId: string): Promise<boolean> {
    const reg = this.modules.get(moduleId)
    if (!reg) {
      this.logger.error(`模块 "${moduleId}" 未注册`)
      console.error(`[ModuleLoader] \u274c \u6a21\u5757 "${moduleId}" \u672a\u6ce8\u518c\uff0c\u65e0\u6cd5\u6fc0\u6d3b`)
      return false
    }

    if (reg.status === 'active') {
      this.logger.warn(`模块 "${moduleId}" 已经激活`)
      return true
    }

    reg.status = 'loading'
    console.log(`[ModuleLoader] ========== \u6a21\u5757 "${moduleId}" \u6fc0\u6d3b\u6d41\u7a0b\u5f00\u59cb ==========`)
    console.log(`[ModuleLoader] \u6a21\u5757 "${moduleId}" \u72b6\u6001 \u2192 loading`)

    try {
      // Step 1: 解析路径
      const modulePath = reg.path || reg.meta.path || ''
      console.log(`[ModuleLoader] [${moduleId}] Step 1 - \u6a21\u5757\u76ee\u5f55: ${modulePath}`)
      const entryPath = this.resolveEntryPath(modulePath)
      console.log(`[ModuleLoader] [${moduleId}] Step 2 - \u5165\u53e3\u6587\u4ef6: ${entryPath}`)

      // Step 2: 动态导入
      console.log(`[ModuleLoader] [${moduleId}] Step 3 - \u5f00\u59cb\u52a8\u6001 import...`)
      const moduleExports = await this.loadModuleEntry(entryPath)
      console.log(`[ModuleLoader] [${moduleId}] Step 3 - import \u6210\u529f\uff0c\u5bfc\u51fa keys: [${Object.keys(moduleExports).join(', ')}]`)
      console.log(`[ModuleLoader] [${moduleId}] Step 3 - default export \u7c7b\u578b: ${typeof moduleExports.default}`)
      if (moduleExports.default) {
        console.log(`[ModuleLoader] [${moduleId}] Step 3 - default export \u540d\u79f0: ${(moduleExports.default as Record<string, unknown>).name || '(\u533f\u540d)'}`)
      }

      // Step 3: 提取类
      const ModuleClass = moduleExports.default || moduleExports
      if (!ModuleClass) {
        throw new Error(`模块 "${moduleId}" 入口文件未导出任何内容 (default export 为空)`)
      }
      console.log(`[ModuleLoader] [${moduleId}] Step 4 - ModuleClass \u7c7b\u578b: ${typeof ModuleClass}, \u662f\u5426\u51fd\u6570: ${typeof ModuleClass === 'function'}`)

      // Step 4: 创建上下文 & 实例化
      console.log(`[ModuleLoader] [${moduleId}] Step 5 - \u521b\u5efa\u4e0a\u4e0b\u6587...`)
      const context = this.createContext(reg.meta)
      console.log(`[ModuleLoader] [${moduleId}] Step 5 - \u4e0a\u4e0b\u6587\u521b\u5efa\u6210\u529f`)

      console.log(`[ModuleLoader] [${moduleId}] Step 6 - \u5f00\u59cb\u5b9e\u4f8b\u5316...`)
      let instance: Module
      try {
        instance = new (ModuleClass as new () => Module)()
      } catch (newErr) {
        console.error(`[ModuleLoader] [${moduleId}] \u274c \u5b9e\u4f8b\u5316 new() \u5931\u8d25:`)
        console.error(`  \u9519\u8bef: ${(newErr as Error).message}`)
        console.error(`  \u5806\u6808: ${(newErr as Error).stack}`)
        throw newErr
      }
      instance.meta = reg.meta
      console.log(`[ModuleLoader] [${moduleId}] Step 6 - \u5b9e\u4f8b\u5316\u6210\u529f, id=${instance.id}`)

      // Step 5: 调用 activate
      console.log(`[ModuleLoader] [${moduleId}] Step 7 - \u8c03\u7528 activate(context)...`)
      await this.withTimeout(
        () => instance.activate(context),
        this.activateTimeoutMs,
        `模块 "${moduleId}" activate 超时（${this.activateTimeoutMs}ms）`
      )
      console.log(`[ModuleLoader] [${moduleId}] Step 7 - activate \u5b8c\u6210`)

      // Step 6: 注册能力
      if (typeof instance.getCapabilities === 'function') {
        const caps = instance.getCapabilities()
        console.log(`[ModuleLoader] [${moduleId}] Step 8 - \u83b7\u53d6\u5230 ${caps?.length ?? 0} \u4e2a\u80fd\u529b`)
      }

      reg.instance = instance
      reg.status = 'active'

      this.eventBus.emit('on_module_loaded', { moduleId })
      this.logger.info(`模块 "${moduleId}" 已激活`)
      console.log(`[ModuleLoader] \u2705 \u6a21\u5757 "${moduleId}" \u6fc0\u6d3b\u6210\u529f`)
      return true
    } catch (err) {
      reg.status = 'error'
      reg.loadError = (err as Error).message
      this.logger.error(`模块 "${moduleId}" 激活失败`, err as Error)
      console.error(`[ModuleLoader] \u274c \u6a21\u5757 "${moduleId}" \u6fc0\u6d3b\u5f02\u5e38:`)
      console.error(`  \u9519\u8bef: ${(err as Error).message}`)
      if ((err as Error).stack) {
        console.error(`  \u5806\u6808: ${(err as Error).stack}`)
      }
      this.eventBus.emit('on_module_error', { moduleId, error: (err as Error).message })
      return false
    }
  }

  /** 停用模块（带超时保护） */
  async deactivate(moduleId: string): Promise<boolean> {
    const reg = this.modules.get(moduleId)
    if (!reg || !reg.instance) return false

    let timedOut = false
    try {
      await this.withTimeout(
        () => reg.instance!.deactivate(),
        this.deactivateTimeoutMs,
        `模块 "${moduleId}" deactivate 超时（${this.deactivateTimeoutMs}ms），强制停用`
      )
      return true
    } catch (err) {
      timedOut = (err as Error).message.includes('超时')
      if (timedOut) {
        this.logger.warn(
          `模块 "${moduleId}" deactivate 超时，已强制标记为停用`,
          err as Error
        )
      } else {
        this.logger.error(`模块 "${moduleId}" 停用异常`, err as Error)
      }
      return false
    } finally {
      reg.instance = null
      reg.status = 'disabled'
      // 清理该模块注册的所有轮询任务
      pollingRegistry.unregisterByModule(moduleId)
      this.eventBus.emit('on_module_unloaded', { moduleId })
      if (!timedOut) {
        this.logger.info(`模块 "${moduleId}" 已停用`)
      }
    }
  }

  /** 创建模块上下文 */
  private createContext(meta: ModuleMeta): ModuleContext {
    // 组合运行时值 + 配置管理器
    const runtimeConfig = Object.assign(Object.create(this.config), {
      dataDir: join(app.getPath('userData'), 'data'),
      appDir: app.getAppPath(),
      defaultModel: 'qwen2.5',
      defaultCity: 'Beijing',
      skillSearchPaths: this.skillSearchPaths,
      taskMaxRetries: 3,
    }) as import('../types/module').ModuleRuntimeConfig

    // 诊断日志：检查关键服务是否可用
    console.log(`[ModuleLoader] [${meta.id}] createContext - ai: ${this.ai ? 'OK' : 'NULL'}, db: ${this.db ? 'OK' : 'NULL'}`)
    console.log(`[ModuleLoader] [${meta.id}] createContext - provides: [${(meta.provides || []).map(p => p.name).join(', ')}]`)
    console.log(`[ModuleLoader] [${meta.id}] createContext - consumes: [${(meta.consumes || []).map(c => c.name).join(', ')}]`)

    return {
      eventBus: createScopedEventBus(
        this.eventBus,
        meta.id,
        meta.provides ?? [],
        meta.consumes ?? []
      ),
      config: runtimeConfig,
      ai: this.ai,
      llm: {
        chat: (messages, options?) => this.ai.chat(messages, options)
      },
      logger: createLogger(meta.id),
      store: this.createScopedStore(meta.id),
      db: this.db,
      getModule: (name: string) => {
        const reg = this.modules.get(name)
        return reg?.instance ?? undefined
      }
    }
  }

  /** 创建模块私有 Store */
  private createScopedStore(moduleId: string): ScopedStore {
    const memoryStore = new Map<string, unknown>()
    return {
      get: <T>(key: string) => memoryStore.get(key) as T | undefined,
      set: <T>(key: string, value: T) => { memoryStore.set(key, value) },
      delete: (key: string) => { memoryStore.delete(key) },
      getPersist: async <T>(key: string) => {
        return this.config.getModuleConfig<T>(moduleId, key)
      },
      setPersist: async <T>(key: string, value: T) => {
        await this.config.setModuleConfig(moduleId, key, value)
      },
      deletePersist: async (key: string) => {
        await this.config.deleteModuleConfig(moduleId, key)
      }
    }
  }

  /** 带超时的 Promise */
  private withTimeout<T>(
    operation: () => Promise<T>,
    ms: number,
    message: string
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(message)), ms)
      })
    ])
  }

  /** 获取所有模块注册信息 */
  getAll(): ModuleRegistration[] {
    return Array.from(this.modules.values())
  }

  /** 获取指定模块 */
  get(moduleId: string): ModuleRegistration | undefined {
    return this.modules.get(moduleId)
  }
}
