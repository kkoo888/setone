import type { Capability, ArbitrationRequest, ArbitrationResult } from '../types/capability'
import type { CapabilityRegistry } from './capability-registry'
import type { ConfigManager } from '../types/config'
import type { Logger } from '../types/logger'

/** 未设置加载顺序时的默认值（视为最低优先级） */
const DEFAULT_LOAD_ORDER = Infinity

/**
 * 能力仲裁器
 * 多模块注册同名能力时，按优先级规则决定由哪个模块处理
 *
 * 仲裁优先级：用户显式指定 > 用户覆盖 > priority 字段 > 加载顺序
 *
 * @author 小茜
 * @date 2026-05-15
 */
export class CapabilityArbiter {
  private userOverrides = new Map<string, string>()
  private moduleLoadOrder = new Map<string, number>()
  private readonly initPromise: Promise<void>

  constructor(
    private registry: CapabilityRegistry,
    private config: ConfigManager,
    private logger: Logger
  ) {
    this.initPromise = this.restoreOverrides()
  }

  /**
   * 确保持久化数据已加载完成
   * @returns Promise<void>
   */
  private async ensureReady(): Promise<void> {
    await this.initPromise
  }

  /**
   * 从配置存储恢复用户覆盖设置
   * @returns Promise<void>
   */
  private async restoreOverrides(): Promise<void> {
    try {
      const saved = await this.config.get<Record<string, string>>('capabilityOverrides', {})
      if (saved && typeof saved === 'object') {
        for (const [cap, mod] of Object.entries(saved)) {
          this.userOverrides.set(cap, mod)
        }
        this.logger.debug('已恢复用户覆盖设置', { count: Object.keys(saved).length })
      }
    } catch (err) {
      this.logger.warn('恢复用户覆盖设置失败', { error: err })
    }
  }

  /**
   * 记录模块加载顺序（由 ModuleManager 在加载时调用）
   * @param moduleId - 模块 ID
   * @param order - 加载顺序值（越小越早加载）
   * @returns void
   */
  setModuleLoadOrder(moduleId: string, order: number): void {
    this.moduleLoadOrder.set(moduleId, order)
  }

  /**
   * 仲裁：决定由哪个模块处理指定能力
   * @param request - 仲裁请求
   * @returns 仲裁结果，无可用能力时返回 null
   */
  async arbitrate(request: ArbitrationRequest): Promise<ArbitrationResult | null> {
    await this.ensureReady()
    const capabilities = this.registry.getCapabilities(request.capabilityName)

    if (capabilities.length === 0) {
      this.logger.warn(`未找到能力: ${request.capabilityName}`)
      return null
    }

    // 1. 用户显式指定
    if (request.requesterModuleId) {
      const found = capabilities.find(c => c.moduleId === request.requesterModuleId)
      if (found) {
        return {
          selectedModuleId: found.moduleId,
          capability: found,
          reason: 'user_selection'
        }
      }
    }

    // 2. 用户覆盖设置
    const override = this.userOverrides.get(request.capabilityName)
    if (override) {
      const found = capabilities.find(c => c.moduleId === override)
      if (found) {
        return {
          selectedModuleId: found.moduleId,
          capability: found,
          reason: 'user_override'
        }
      }
    }

    // 3. priority 排序（数值越小越优先）
    const sorted = [...capabilities].sort((a, b) => a.priority - b.priority)
    const highest = sorted[0]

    // 检查是否有并列
    const samePriority = sorted.filter(c => c.priority === highest.priority)
    if (samePriority.length > 1) {
      this.logger.warn(`能力 "${request.capabilityName}" 存在多个同优先级模块`, {
        modules: samePriority.map(c => c.moduleId)
      })

      const byLoadOrder = samePriority.sort((a, b) => {
        const orderA = this.moduleLoadOrder.get(a.moduleId) ?? DEFAULT_LOAD_ORDER
        const orderB = this.moduleLoadOrder.get(b.moduleId) ?? DEFAULT_LOAD_ORDER
        return orderA - orderB
      })

      return {
        selectedModuleId: byLoadOrder[0].moduleId,
        capability: byLoadOrder[0],
        reason: 'load_order'
      }
    }

    return {
      selectedModuleId: highest.moduleId,
      capability: highest,
      reason: 'priority'
    }
  }

  /**
   * 设置用户覆盖（持久化）
   * @param capabilityName - 能力名称
   * @param moduleId - 要指定的模块 ID
   * @returns Promise<void>
   */
  async setUserOverride(capabilityName: string, moduleId: string): Promise<void> {
    await this.ensureReady()

    const caps = this.registry.getCapabilities(capabilityName)
    if (!caps.some(c => c.moduleId === moduleId)) {
      this.logger.warn(
        `设置用户覆盖失败：模块 "${moduleId}" 未注册能力 "${capabilityName}"`
      )
      return
    }

    this.userOverrides.set(capabilityName, moduleId)
    this.logger.info(`用户覆盖能力 "${capabilityName}" → 模块 "${moduleId}"`)

    try {
      const current: Record<string, string> = {}
      for (const [k, v] of this.userOverrides) current[k] = v
      await this.config.set('capabilityOverrides', current)
    } catch (err) {
      this.logger.error('持久化用户覆盖失败', err as Error)
    }
  }

  /**
   * 获取用户覆盖的模块 ID
   * @param capabilityName - 能力名称
   * @returns 覆盖的模块 ID，未设置时返回 undefined
   */
  getUserOverride(capabilityName: string): string | undefined {
    return this.userOverrides.get(capabilityName)
  }

  /**
   * 清除用户覆盖（持久化）
   * @param capabilityName - 能力名称
   * @returns Promise<void>
   */
  async clearUserOverride(capabilityName: string): Promise<void> {
    await this.ensureReady()

    this.userOverrides.delete(capabilityName)

    try {
      const current: Record<string, string> = {}
      for (const [k, v] of this.userOverrides) current[k] = v
      await this.config.set('capabilityOverrides', current)
    } catch (err) {
      this.logger.error('持久化用户覆盖失败', err as Error)
    }
  }
}
