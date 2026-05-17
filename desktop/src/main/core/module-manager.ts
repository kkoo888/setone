import { join } from 'path'
import { app } from 'electron'
import type { EventBus } from '../types/event'
import type { ConfigManager } from '../types/config'
import type { AIService } from '../types/ai'
import type { DatabaseManager } from '../types/database'
import type { ModuleRegistration } from '../types/module'
import { ModuleScanner } from './module-scanner'
import { DependencyResolver } from './dependency-resolver'
import { ModuleLoader } from './module-loader'
import { createLogger } from './logger'
import type { Logger } from '../types/logger'

/**
 * 模块管理器（核心中枢）
 * 负责模块的扫描、依赖解析、生命周期管理
 *
 * @author 小茜
 * @date 2026-05-15
 */
export class ModuleManager {
  private scanner: ModuleScanner
  private resolver: DependencyResolver
  private loader: ModuleLoader
  private logger: Logger
  private moduleLoadCounter = 0

  constructor(
    private eventBus: EventBus,
    private config: ConfigManager,
    private ai: AIService,
    private db: DatabaseManager,
    modulesDir?: string
  ) {
    this.logger = createLogger('module-manager')
    const dir = modulesDir ?? join(app.getPath('userData'), 'modules')
    this.scanner = new ModuleScanner(dir, this.logger)
    this.resolver = new DependencyResolver()

    // 技能搜索路径：应用根目录 skills + 模块目录 skills + 用户数据 skills + 工作区 skills
    const skillSearchPaths = [
      join(app.getAppPath(), 'skills'),
      join(dir, 'skills'),
      join(app.getPath('userData'), 'skills'),
      join(process.cwd(), 'skills'),
    ]
    this.loader = new ModuleLoader(eventBus, config, ai, db, this.logger, { skillSearchPaths })
  }

  /** 初始化：扫描 → 解析 → 加载 */
  async initialize(): Promise<void> {
    this.logger.info('开始初始化模块管理器...')
    console.log('[ModuleManager] ===== \u6a21\u5757\u521d\u59cb\u5316\u5f00\u59cb =====')

    // 1. 扫描模块
    const scanned = await this.scanner.scan()
    this.logger.info(`发现 ${scanned.length} 个模块`)
    console.log(`[ModuleManager] \u626b\u63cf\u5230 ${scanned.length} \u4e2a\u6a21\u5757:`)
    for (const mod of scanned) {
      console.log(`  - ${mod.meta.id} v${mod.meta.version} (path: ${mod.path})`)
    }

    // 2. 依赖解析
    const resolution = this.resolver.resolve(scanned)
    if (resolution.errors.length > 0) {
      this.logger.warn(`依赖解析发现 ${resolution.errors.length} 个错误`)
      console.warn(`[ModuleManager] \u26a0\ufe0f \u4f9d\u8d56\u89e3\u6790\u9519\u8bef (${resolution.errors.length} \u4e2a):`)
      for (const err of resolution.errors) {
        console.warn(`  \u274c [${err.moduleId}] ${err.type}: ${err.message}`)
        this.logger.warn(`依赖错误 [${err.moduleId}]: ${err.message}`)
      }
    }

    console.log(`[ModuleManager] \u4f9d\u8d56\u89e3\u6790\u901a\u8fc7\uff0c\u52a0\u8f7d\u987a\u5e8f: [${resolution.order.join(' \u2192 ')}]`)

    // 3. 注册模块
    for (const mod of scanned) {
      this.loader.register(mod.meta, mod.path, mod.hash)
    }
    console.log(`[ModuleManager] \u5df2\u6ce8\u518c ${scanned.length} \u4e2a\u6a21\u5757`)

    // 3.5 标记因依赖问题被跳过的模块
    const errorModuleIds = new Set(resolution.errors.map(e => e.moduleId))
    for (const mod of scanned) {
      if (errorModuleIds.has(mod.meta.id)) {
        const reg = this.loader.get(mod.meta.id)
        if (reg) {
          reg.status = 'error'
          const moduleErrors = resolution.errors.filter(e => e.moduleId === mod.meta.id)
          reg.loadError = moduleErrors.map(e => e.message).join('; ')
        }
      }
    }
    if (errorModuleIds.size > 0) {
      this.logger.warn(
        `以下模块因依赖问题被跳过: [${[...errorModuleIds].join(', ')}]`
      )
      console.warn(`[ModuleManager] \u4ee5\u4e0b\u6a21\u5757\u56e0\u4f9d\u8d56\u95ee\u9898\u88ab\u8df3\u8fc7: [${[...errorModuleIds].join(', ')}]`)
    }

    // 4. 按拓扑顺序加载已启用模块
    const enabledModules = await this.config.get<string[]>('modules.enabled', [])
    const disabledModules = await this.config.get<string[]>('modules.disabled', [])

    console.log(`[ModuleManager] \u5f00\u59cb\u6fc0\u6d3b\u6a21\u5757\uff0c\u5171 ${resolution.order.length} \u4e2a\u5f85\u5904\u7406`)

    for (const moduleId of resolution.order) {
      const reg = this.loader.get(moduleId)
      if (!reg) {
        console.warn(`[ModuleManager] \u6a21\u5757 "${moduleId}" \u672a\u6ce8\u518c\uff0c\u8df3\u8fc7`)
        continue
      }

      const isDisabled = disabledModules.includes(moduleId)
      const isEnabled = enabledModules.includes(moduleId) || (!isDisabled && reg.meta.enabled)

      if (isEnabled) {
        console.log(`[ModuleManager] \u6b63\u5728\u6fc0\u6d3b\u6a21\u5757: ${moduleId}...`)
        const success = await this.loader.activate(moduleId)
        if (success) {
          this.moduleLoadCounter++
          console.log(`[ModuleManager] \u2705 \u6a21\u5757 "${moduleId}" \u6fc0\u6d3b\u6210\u529f`)
        } else {
          console.error(`[ModuleManager] \u274c \u6a21\u5757 "${moduleId}" \u6fc0\u6d3b\u5931\u8d25 (loadError: ${reg.loadError || '\u65e0'})`)
        }
      } else {
        this.logger.info(`模块 "${moduleId}" 已禁用，跳过加载`)
        console.log(`[ModuleManager] \u23ed\ufe0f \u6a21\u5757 "${moduleId}" \u5df2\u7981\u7528\uff0c\u8df3\u8fc7`)
      }
    }

    // 5. 输出最终状态汇总
    const allModules = this.loader.getAll()
    const activeCount = allModules.filter(m => m.status === 'active').length
    const errorCount = allModules.filter(m => m.status === 'error').length
    const disabledCount = allModules.filter(m => m.status === 'disabled').length

    console.log('[ModuleManager] ===== \u6a21\u5757\u521d\u59cb\u5316\u5b8c\u6210 =====')
    console.log(`[ModuleManager] \u603b\u8ba1: ${allModules.length} | \u6fc0\u6d3b: ${activeCount} | \u5931\u8d25: ${errorCount} | \u7981\u7528: ${disabledCount}`)

    // 打印每个模块的最终状态
    for (const mod of allModules) {
      const icon = mod.status === 'active' ? '✅' : mod.status === 'error' ? '❌' : '⏭️'
      const errorMsg = mod.loadError ? ` (${mod.loadError})` : ''
      console.log(`  ${icon} ${mod.meta.id}: ${mod.status}${errorMsg}`)
    }

    this.logger.info('模块管理器初始化完成')
  }

  /** 启用模块 */
  async enableModule(moduleId: string): Promise<boolean> {
    // 先保存用户意图到配置（即使激活失败也保留偏好）
    const disabled = await this.config.get<string[]>('modules.disabled', [])
    const newDisabled = disabled.filter(id => id !== moduleId)
    await this.config.set('modules.disabled', newDisabled)

    const success = await this.loader.activate(moduleId)
    if (success) {
      this.moduleLoadCounter++
    } else {
      this.logger.error(`模块 "${moduleId}" 激活失败，但用户偏好已保存`)
    }
    return success
  }

  /** 禁用模块 */
  async disableModule(moduleId: string): Promise<boolean> {
    // 先保存用户意图到配置
    const disabled = await this.config.get<string[]>('modules.disabled', [])
    if (!disabled.includes(moduleId)) {
      disabled.push(moduleId)
      await this.config.set('modules.disabled', disabled)
    }

    const success = await this.loader.deactivate(moduleId)
    if (!success) {
      this.logger.warn(`模块 "${moduleId}" 停用异常，但用户偏好已保存`)
    }
    return success
  }

  /** 热重载模块 */
  async reloadModule(moduleId: string): Promise<boolean> {
    this.logger.info(`热重载模块: ${moduleId}`)
    await this.loader.deactivate(moduleId)
    return this.loader.activate(moduleId)
  }

  /** 获取所有模块状态 */
  getModules(): ModuleRegistration[] {
    return this.loader.getAll()
  }

  /** 获取指定模块 */
  getModule(moduleId: string): ModuleRegistration | undefined {
    return this.loader.get(moduleId)
  }
}
