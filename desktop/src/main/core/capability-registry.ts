import type { Capability } from '../types/capability'
import type { Logger } from '../types/logger'

/**
 * 能力注册表
 * 负责能力的注册、注销和查询，支持同名能力多模块注册与去重
 *
 * @author 小茜
 * @date 2026-05-15
 */
export class CapabilityRegistry {
  private capabilities = new Map<string, Capability[]>()
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  /**
   * 注册能力（去重：同名同模块不重复注册，而是更新）
   * @param capability - 要注册的能力实例
   * @returns void
   */
  register(capability: Capability): void {
    const existing = this.capabilities.get(capability.name) || []

    const idx = existing.findIndex(c => c.moduleId === capability.moduleId)
    if (idx >= 0) {
      this.logger.debug(`更新能力: ${capability.name} (模块: ${capability.moduleId})`)
      existing[idx] = capability
    } else {
      existing.push(capability)
    }

    this.capabilities.set(capability.name, existing)

    this.logger.debug(`能力已注册: ${capability.name}`, {
      moduleId: capability.moduleId,
      priority: capability.priority
    })
  }

  /**
   * 注销指定模块的所有能力
   * @param moduleId - 要注销的模块 ID
   * @returns void
   */
  unregisterModule(moduleId: string): void {
    for (const [name, caps] of this.capabilities) {
      const filtered = caps.filter(c => c.moduleId !== moduleId)
      if (filtered.length === 0) {
        this.capabilities.delete(name)
      } else {
        this.capabilities.set(name, filtered)
      }
    }
  }

  /**
   * 获取指定名称的能力列表
   * @param name - 能力名称
   * @returns 匹配的能力数组，不存在时返回空数组
   */
  getCapabilities(name: string): Capability[] {
    return this.capabilities.get(name) || []
  }

  /**
   * 获取所有已注册的能力名称
   * @returns 能力名称数组
   */
  getAllNames(): string[] {
    return Array.from(this.capabilities.keys())
  }

  /**
   * 获取所有能力，按模块 ID 分组
   * @returns moduleId → Capability[] 的映射
   */
  getByModule(): Map<string, Capability[]> {
    const result = new Map<string, Capability[]>()
    for (const caps of this.capabilities.values()) {
      for (const cap of caps) {
        const existing = result.get(cap.moduleId) || []
        existing.push(cap)
        result.set(cap.moduleId, existing)
      }
    }
    return result
  }
}
