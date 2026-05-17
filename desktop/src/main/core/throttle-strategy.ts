/**
 * 降频策略引擎
 * 4 个等级：FULL / AWARE / DEGRADED / LOW_POWER
 * 支持阈值判断 + 冷却时间机制
 * 版块26 - 性能监控
 */
import { ThrottleLevel } from '../types/performance'
import type { PerformanceMonitorConfig } from '../types/performance'

/** 降频策略引擎 */
export class ThrottleStrategyEngine {
  /** 当前降频等级 */
  private currentLevel: ThrottleLevel = ThrottleLevel.FULL
  /** 上次等级变更时间 */
  private lastChangeTime: number = 0
  /** 降频配置 */
  private config: PerformanceMonitorConfig['throttle']

  constructor(config: PerformanceMonitorConfig['throttle']) {
    this.config = config
  }

  /**
   * 根据当前资源使用率评估降频等级
   * @param cpuUsage CPU 使用率（百分比）
   * @param memoryUsage 内存使用率（百分比）
   * @returns 降频等级
   */
  evaluate(cpuUsage: number, memoryUsage: number): ThrottleLevel {
    const now = Date.now()
    const timeSinceLastChange = now - this.lastChangeTime

    // 冷却期内不切换（防止频繁抖动）
    if (timeSinceLastChange < this.config.cooldownMs) {
      return this.currentLevel
    }

    // 计算目标等级（取 CPU 和内存中更严重的等级）
    const cpuLevel = this.getLevelFromCpu(cpuUsage)
    const memLevel = this.getLevelFromMemory(memoryUsage)
    const targetLevel = this.getMoreSevere(cpuLevel, memLevel)

    // 只有当目标等级与当前等级不同时才切换
    if (targetLevel !== this.currentLevel) {
      this.currentLevel = targetLevel
      this.lastChangeTime = now
    }

    return this.currentLevel
  }

  /**
   * 根据 CPU 使用率确定降频等级
   */
  private getLevelFromCpu(cpuUsage: number): ThrottleLevel {
    if (cpuUsage >= this.config.lowPowerThreshold) {
      return ThrottleLevel.LOW_POWER
    }
    if (cpuUsage >= this.config.degradedThreshold) {
      return ThrottleLevel.DEGRADED
    }
    if (cpuUsage >= this.config.awareThreshold) {
      return ThrottleLevel.AWARE
    }
    return ThrottleLevel.FULL
  }

  /**
   * 根据内存使用率确定降频等级
   * 内存阈值比 CPU 高 10%（内存压力更紧迫）
   */
  private getLevelFromMemory(memoryUsage: number): ThrottleLevel {
    if (memoryUsage >= this.config.lowPowerThreshold + 10) {
      return ThrottleLevel.LOW_POWER
    }
    if (memoryUsage >= this.config.degradedThreshold + 10) {
      return ThrottleLevel.DEGRADED
    }
    if (memoryUsage >= this.config.awareThreshold + 10) {
      return ThrottleLevel.AWARE
    }
    return ThrottleLevel.FULL
  }

  /**
   * 取两个等级中更严重的一个
   */
  private getMoreSevere(a: ThrottleLevel, b: ThrottleLevel): ThrottleLevel {
    const severity: Record<ThrottleLevel, number> = {
      [ThrottleLevel.FULL]: 0,
      [ThrottleLevel.AWARE]: 1,
      [ThrottleLevel.DEGRADED]: 2,
      [ThrottleLevel.LOW_POWER]: 3,
    }
    return severity[a] >= severity[b] ? a : b
  }

  /**
   * 获取当前降频等级
   */
  getCurrentLevel(): ThrottleLevel {
    return this.currentLevel
  }

  /**
   * 强制设置降频等级（用于手动控制）
   */
  forceLevel(level: ThrottleLevel): void {
    this.currentLevel = level
    this.lastChangeTime = Date.now()
  }

  /**
   * 重置为 FULL 等级
   */
  reset(): void {
    this.currentLevel = ThrottleLevel.FULL
    this.lastChangeTime = 0
  }

  /**
   * 更新配置
   */
  updateConfig(config: PerformanceMonitorConfig['throttle']): void {
    this.config = config
  }
}
