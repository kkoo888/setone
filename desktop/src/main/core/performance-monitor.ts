/**
 * 性能监控核心
 * 实现 IPerformanceMonitor 接口
 * 定时采集、历史记录、事件通知、趋势预测、数据导出
 * 版块26 - 性能监控
 */
import { ResourceCollector } from './resource-collector'
import { ThrottleStrategyEngine } from './throttle-strategy'
import { ModuleResourceController, type ModuleControlCallbacks } from './module-resource-controller'
import { pollingRegistry } from './polling-registry'
import type {
  SystemResourceSnapshot,
  ThrottleLevel,
  ModuleResourceDeclaration,
  TrendPrediction,
  PerformanceEvent,
  PerformanceMonitorConfig,
  IPerformanceMonitor,
} from '../types/performance'

/** 默认性能监控配置 */
const DEFAULT_CONFIG: PerformanceMonitorConfig = {
  enabled: true,
  interval: 5000,
  historySize: 360, // 保留 30 分钟（5 秒间隔）
  cpuAlertThreshold: 80,
  memoryAlertThreshold: 85,
  diskAlertThreshold: 90,
  gpuAlertThreshold: 90,
  throttle: {
    awareThreshold: 60,
    degradedThreshold: 80,
    lowPowerThreshold: 95,
    cooldownMs: 30000, // 30 秒冷却
  },
}

/**
 * 性能监控器
 * 实现完整的系统性能监控功能
 */
export class PerformanceMonitor implements IPerformanceMonitor {
  /** 资源采集器 */
  private readonly collector: ResourceCollector
  /** 降频策略引擎 */
  private readonly throttleEngine: ThrottleStrategyEngine
  /** 模块资源控制器 */
  private readonly moduleController: ModuleResourceController
  /** 配置 */
  private config: PerformanceMonitorConfig
  /** 历史记录 */
  private history: SystemResourceSnapshot[] = []
  /** 定时器 */
  private timer: ReturnType<typeof setInterval> | null = null
  /** 事件监听器 */
  private eventHandlers: Array<(event: PerformanceEvent) => void> = []
  /** 上一次降频等级 */
  private lastThrottleLevel: ThrottleLevel = 'FULL'
  /** 是否已启动 */
  private running = false

  constructor(
    config?: Partial<PerformanceMonitorConfig>,
    moduleCallbacks?: ModuleControlCallbacks
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.collector = new ResourceCollector()
    this.throttleEngine = new ThrottleStrategyEngine(this.config.throttle)
    this.moduleController = new ModuleResourceController(
      moduleCallbacks ?? { onPause: async () => {}, onResume: async () => {} }
    )
  }

  /**
   * 启动监控
   */
  start(): void {
    if (this.running) return
    this.running = true

    // 注册到轮询注册中心
    pollingRegistry.register({
      id: 'performance-monitor',
      module: '性能监控',
      description: `系统资源采集（CPU/内存/磁盘/GPU）`,
      intervalMs: this.config.interval,
      status: 'running',
    })

    // 立即采集一次
    void this.tick()

    // 定时采集
    this.timer = setInterval(() => {
      void this.tick()
      pollingRegistry.tick('performance-monitor', '正在采集 CPU/内存/磁盘/GPU 数据')
    }, this.config.interval)
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.running = false
    pollingRegistry.update('performance-monitor', { status: 'stopped' })
  }

  /**
   * 获取最新快照
   */
  getLatestSnapshot(): SystemResourceSnapshot | null {
    return this.history.length > 0 ? this.history[this.history.length - 1]! : null
  }

  /**
   * 获取历史记录
   * @param count 获取最近 N 条，默认全部
   */
  getHistory(count?: number): readonly SystemResourceSnapshot[] {
    if (count === undefined) return [...this.history]
    return this.history.slice(-count)
  }

  /**
   * 注册模块资源声明
   */
  registerModule(declaration: ModuleResourceDeclaration): void {
    this.moduleController.register(declaration)
  }

  /**
   * 注销模块
   */
  unregisterModule(moduleId: string): void {
    this.moduleController.unregister(moduleId)
  }

  /**
   * 获取当前降频等级
   */
  getThrottleLevel(): ThrottleLevel {
    return this.throttleEngine.getCurrentLevel()
  }

  /**
   * 趋势预测（线性回归）
   * @param resourceType 资源类型
   * @param steps 向前预测步数（默认 12 步，即 1 分钟）
   */
  predictTrend(
    resourceType: 'cpu' | 'memory' | 'disk' | 'gpu',
    steps: number = 12
  ): TrendPrediction {
    const data = this.history.map((s) => {
      switch (resourceType) {
        case 'cpu': return s.cpu
        case 'memory': return s.memory
        case 'disk': return s.disk
        case 'gpu': return s.gpu
      }
    })

    // 至少需要 2 个数据点
    if (data.length < 2) {
      return {
        resourceType,
        predictedValue: data[0] ?? 0,
        predictedAt: Date.now() + steps * this.config.interval,
        confidence: 0,
        trend: 'stable',
      }
    }

    // 简单线性回归: y = a + b*x
    const n = data.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    for (let i = 0; i < n; i++) {
      sumX += i
      sumY += data[i]!
      sumXY += i * data[i]!
      sumX2 += i * i
    }

    const denominator = n * sumX2 - sumX * sumX
    const b = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0
    const a = (sumY - b * sumX) / n

    // 预测值
    const predictedX = n + steps - 1
    const predictedValue = Math.max(0, Math.min(100, a + b * predictedX))

    // 计算 R² 置信度
    const meanY = sumY / n
    let ssRes = 0, ssTot = 0
    for (let i = 0; i < n; i++) {
      const predicted = a + b * i
      ssRes += (data[i]! - predicted) ** 2
      ssTot += (data[i]! - meanY) ** 2
    }
    const confidence = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0

    // 趋势方向
    let trend: 'rising' | 'falling' | 'stable'
    if (Math.abs(b) < 0.1) {
      trend = 'stable'
    } else if (b > 0) {
      trend = 'rising'
    } else {
      trend = 'falling'
    }

    return {
      resourceType,
      predictedValue: Math.round(predictedValue * 10) / 10,
      predictedAt: Date.now() + steps * this.config.interval,
      confidence: Math.round(confidence * 100) / 100,
      trend,
    }
  }

  /**
   * 导出历史数据
   * @param format 导出格式
   */
  exportHistory(format: 'json' | 'csv'): string {
    if (format === 'json') {
      return JSON.stringify(this.history, null, 2)
    }

    // CSV 格式
    const headers = [
      'timestamp', 'cpu', 'memory', 'memoryUsedMB', 'memoryTotalMB',
      'disk', 'diskReadKBps', 'diskWriteKBps', 'gpu', 'gpuMemory',
    ]
    const rows = this.history.map((s) => [
      s.timestamp, s.cpu, s.memory, s.memoryUsedMB, s.memoryTotalMB,
      s.disk, s.diskReadKBps, s.diskWriteKBps, s.gpu, s.gpuMemory,
    ].join(','))

    return [headers.join(','), ...rows].join('\n')
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PerformanceMonitorConfig>): void {
    this.config = { ...this.config, ...config }
    this.throttleEngine.updateConfig(this.config.throttle)

    // 如果间隔变更，重启定时器
    if (this.running && config.interval !== undefined) {
      this.stop()
      this.start()
    }
  }

  /**
   * 注册事件监听
   * @returns 取消监听的函数
   */
  onEvent(handler: (event: PerformanceEvent) => void): () => void {
    this.eventHandlers.push(handler)
    return () => {
      const idx = this.eventHandlers.indexOf(handler)
      if (idx >= 0) this.eventHandlers.splice(idx, 1)
    }
  }

  /**
   * 单次采集周期
   */
  private async tick(): Promise<void> {
    try {
      // 采集系统资源
      const moduleStates = this.moduleController.getStates()
      const snapshot = await this.collector.collect(moduleStates)

      // 存入历史
      this.history.push(snapshot)
      // 裁剪历史记录
      if (this.history.length > this.config.historySize) {
        this.history = this.history.slice(-this.config.historySize)
      }

      // 检查告警阈值
      this.checkAlerts(snapshot)

      // 评估降频等级
      const level = this.throttleEngine.evaluate(snapshot.cpu, snapshot.memory)
      if (level !== this.lastThrottleLevel) {
        this.emitEvent({
          type: 'throttle_changed',
          timestamp: Date.now(),
          message: `降频等级变更: ${this.lastThrottleLevel} → ${level}`,
          data: { from: this.lastThrottleLevel, to: level },
        })

        // 应用降频策略
        const pausedModules = await this.moduleController.applyThrottle(level)
        for (const moduleId of pausedModules) {
          this.emitEvent({
            type: 'module_paused',
            timestamp: Date.now(),
            moduleId,
            message: `模块 ${moduleId} 因资源不足被暂停`,
          })
        }

        this.lastThrottleLevel = level
      }
    } catch (err) {
      console.error('[PerformanceMonitor] 采集失败:', err)
    }
  }

  /**
   * 检查告警阈值
   */
  private checkAlerts(snapshot: SystemResourceSnapshot): void {
    if (snapshot.cpu >= this.config.cpuAlertThreshold) {
      this.emitEvent({
        type: 'threshold_exceeded',
        timestamp: Date.now(),
        resourceType: 'cpu',
        message: `CPU 使用率告警: ${snapshot.cpu}% (阈值: ${this.config.cpuAlertThreshold}%)`,
      })
    }
    if (snapshot.memory >= this.config.memoryAlertThreshold) {
      this.emitEvent({
        type: 'threshold_exceeded',
        timestamp: Date.now(),
        resourceType: 'memory',
        message: `内存使用率告警: ${snapshot.memory}% (阈值: ${this.config.memoryAlertThreshold}%)`,
      })
    }
    if (snapshot.disk >= this.config.diskAlertThreshold) {
      this.emitEvent({
        type: 'threshold_exceeded',
        timestamp: Date.now(),
        resourceType: 'disk',
        message: `磁盘使用率告警: ${snapshot.disk}% (阈值: ${this.config.diskAlertThreshold}%)`,
      })
    }
    if (snapshot.gpu >= 0 && snapshot.gpu >= this.config.gpuAlertThreshold) {
      this.emitEvent({
        type: 'threshold_exceeded',
        timestamp: Date.now(),
        resourceType: 'gpu',
        message: `GPU 使用率告警: ${snapshot.gpu}% (阈值: ${this.config.gpuAlertThreshold}%)`,
      })
    }
  }

  /**
   * 触发事件通知
   */
  private emitEvent(event: PerformanceEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event)
      } catch (err) {
        console.error('[PerformanceMonitor] 事件处理器异常:', err)
      }
    }
  }
}
