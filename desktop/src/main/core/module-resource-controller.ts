/**
 * 模块资源控制器
 * 负责模块暂停/恢复、资源限制
 * 版块26 - 性能监控
 */
import type {
  ModuleResourceDeclaration,
  ModuleResourceState,
  ThrottleLevel,
} from '../types/performance'

/** 模块控制回调 */
export interface ModuleControlCallbacks {
  /** 暂停模块 */
  onPause: (moduleId: string) => Promise<void>
  /** 恢复模块 */
  onResume: (moduleId: string) => Promise<void>
}

/**
 * 模块资源控制器
 * 管理模块的资源声明、暂停/恢复、资源限制检查
 */
export class ModuleResourceController {
  /** 已注册的模块资源声明 */
  private declarations = new Map<string, ModuleResourceDeclaration>()
  /** 模块运行时状态 */
  private states = new Map<string, ModuleResourceState>()
  /** 控制回调 */
  private callbacks: ModuleControlCallbacks

  constructor(callbacks: ModuleControlCallbacks) {
    this.callbacks = callbacks
  }

  /**
   * 注册模块资源声明
   */
  register(declaration: ModuleResourceDeclaration): void {
    this.declarations.set(declaration.moduleId, declaration)
    // 初始化状态
    this.states.set(declaration.moduleId, {
      moduleId: declaration.moduleId,
      memoryMB: 0,
      cpuPercent: 0,
      paused: false,
      lastUpdated: Date.now(),
    })
  }

  /**
   * 注销模块
   */
  unregister(moduleId: string): void {
    this.declarations.delete(moduleId)
    this.states.delete(moduleId)
  }

  /**
   * 更新模块资源使用数据
   */
  updateUsage(moduleId: string, memoryMB: number, cpuPercent: number): void {
    const existing = this.states.get(moduleId)
    if (existing) {
      this.states.set(moduleId, {
        ...existing,
        memoryMB,
        cpuPercent,
        lastUpdated: Date.now(),
      })
    }
  }

  /**
   * 检查模块是否超出资源限制
   * @returns 超限的资源类型列表
   */
  checkLimits(moduleId: string): string[] {
    const declaration = this.declarations.get(moduleId)
    const state = this.states.get(moduleId)
    if (!declaration || !state) return []

    const violations: string[] = []
    if (state.memoryMB > declaration.maxMemoryMB) {
      violations.push(`内存超限: ${state.memoryMB}MB > ${declaration.maxMemoryMB}MB`)
    }
    if (state.cpuPercent > declaration.maxCpuPercent) {
      violations.push(`CPU 超限: ${state.cpuPercent}% > ${declaration.maxCpuPercent}%`)
    }
    return violations
  }

  /**
   * 根据降频等级暂停非关键模块
   * @returns 被暂停的模块 ID 列表
   */
  async applyThrottle(level: ThrottleLevel): Promise<string[]> {
    const pausedModules: string[] = []

    if (level === 'FULL') {
      // 全速模式：恢复所有被暂停的非关键模块
      for (const [id, state] of this.states) {
        if (state.paused) {
          const declaration = this.declarations.get(id)
          if (declaration && !declaration.critical) {
            await this.resumeModule(id)
          }
        }
      }
      return pausedModules
    }

    // 按优先级排序（数字越大越先被暂停）
    const sortedModules = Array.from(this.declarations.entries())
      .filter(([, decl]) => !decl.critical)
      .sort(([, a], [, b]) => b.priority - a.priority)

    // DEGRADED: 暂停低优先级模块
    if (level === 'DEGRADED' || level === 'LOW_POWER') {
      const threshold = level === 'LOW_POWER' ? 0.3 : 0.6
      const toPause = sortedModules.slice(0, Math.ceil(sortedModules.length * threshold))
      for (const [id] of toPause) {
        const state = this.states.get(id)
        if (state && !state.paused) {
          await this.pauseModule(id)
          pausedModules.push(id)
        }
      }
    }

    return pausedModules
  }

  /**
   * 暂停指定模块
   */
  async pauseModule(moduleId: string): Promise<void> {
    const state = this.states.get(moduleId)
    if (!state || state.paused) return

    try {
      await this.callbacks.onPause(moduleId)
      this.states.set(moduleId, { ...state, paused: true, lastUpdated: Date.now() })
    } catch (err) {
      console.error(`[ModuleResourceController] 暂停模块 ${moduleId} 失败:`, err)
    }
  }

  /**
   * 恢复指定模块
   */
  async resumeModule(moduleId: string): Promise<void> {
    const state = this.states.get(moduleId)
    if (!state || !state.paused) return

    try {
      await this.callbacks.onResume(moduleId)
      this.states.set(moduleId, { ...state, paused: false, lastUpdated: Date.now() })
    } catch (err) {
      console.error(`[ModuleResourceController] 恢复模块 ${moduleId} 失败:`, err)
    }
  }

  /**
   * 获取所有模块状态
   */
  getStates(): Record<string, ModuleResourceState> {
    const result: Record<string, ModuleResourceState> = {}
    for (const [id, state] of this.states) {
      result[id] = state
    }
    return result
  }

  /**
   * 获取指定模块状态
   */
  getState(moduleId: string): ModuleResourceState | null {
    return this.states.get(moduleId) ?? null
  }

  /**
   * 获取指定模块声明
   */
  getDeclaration(moduleId: string): ModuleResourceDeclaration | null {
    return this.declarations.get(moduleId) ?? null
  }

  /**
   * 获取所有已注册的模块 ID
   */
  getRegisteredModuleIds(): string[] {
    return Array.from(this.declarations.keys())
  }
}
