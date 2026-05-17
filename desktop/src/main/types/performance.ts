/**
 * 性能监控相关类型定义
 * 版块26 - 性能监控
 */

/** 系统资源快照 */
export interface SystemResourceSnapshot {
  /** 采集时间戳 */
  readonly timestamp: number
  /** CPU 使用率（百分比 0-100） */
  readonly cpu: number
  /** 内存使用率（百分比 0-100） */
  readonly memory: number
  /** 内存使用量（MB） */
  readonly memoryUsedMB: number
  /** 内存总量（MB） */
  readonly memoryTotalMB: number
  /** 磁盘使用率（百分比 0-100） */
  readonly disk: number
  /** 磁盘读取速率（KB/s） */
  readonly diskReadKBps: number
  /** 磁盘写入速率（KB/s） */
  readonly diskWriteKBps: number
  /** GPU 使用率（百分比 0-100，不可用时为 -1） */
  readonly gpu: number
  /** GPU 显存使用率（百分比 0-100，不可用时为 -1） */
  readonly gpuMemory: number
  /** 各模块资源占用 */
  readonly modules: Readonly<Record<string, ModuleResourceState>>
}

/** 降频等级 */
export enum ThrottleLevel {
  /** 全速运行 */
  FULL = 'FULL',
  /** 资源感知（提示性警告） */
  AWARE = 'AWARE',
  /** 降级运行（限制非关键模块） */
  DEGRADED = 'DEGRADED',
  /** 低功耗模式（仅保留核心功能） */
  LOW_POWER = 'LOW_POWER',
}

/** 模块资源声明（模块启动时注册） */
export interface ModuleResourceDeclaration {
  /** 模块 ID */
  readonly moduleId: string
  /** 最大内存限制（MB） */
  readonly maxMemoryMB: number
  /** 最大 CPU 占用（百分比） */
  readonly maxCpuPercent: number
  /** 是否为关键模块（降级时不停止） */
  readonly critical: boolean
  /** 优先级（数字越小越优先保留） */
  readonly priority: number
}

/** 模块资源运行时状态 */
export interface ModuleResourceState {
  /** 模块 ID */
  readonly moduleId: string
  /** 当前内存使用（MB） */
  readonly memoryMB: number
  /** 当前 CPU 占用（百分比） */
  readonly cpuPercent: number
  /** 是否被暂停 */
  readonly paused: boolean
  /** 最后更新时间 */
  readonly lastUpdated: number
}

/** 趋势预测结果 */
export interface TrendPrediction {
  /** 预测的资源类型 */
  readonly resourceType: 'cpu' | 'memory' | 'disk' | 'gpu'
  /** 预测值 */
  readonly predictedValue: number
  /** 预测时间戳 */
  readonly predictedAt: number
  /** 置信度（0-1） */
  readonly confidence: number
  /** 趋势方向 */
  readonly trend: 'rising' | 'falling' | 'stable'
}

/** 性能事件 */
export interface PerformanceEvent {
  /** 事件类型 */
  readonly type: 'threshold_exceeded' | 'throttle_changed' | 'module_paused' | 'module_resumed' | 'trend_alert'
  /** 事件时间戳 */
  readonly timestamp: number
  /** 相关资源类型 */
  readonly resourceType?: string
  /** 相关模块 ID */
  readonly moduleId?: string
  /** 事件详情 */
  readonly message: string
  /** 事件数据 */
  readonly data?: unknown
}

/** 性能监控配置 */
export interface PerformanceMonitorConfig {
  /** 是否启用 */
  readonly enabled: boolean
  /** 采集间隔（毫秒） */
  readonly interval: number
  /** 历史数据保留数量 */
  readonly historySize: number
  /** CPU 告警阈值（百分比） */
  readonly cpuAlertThreshold: number
  /** 内存告警阈值（百分比） */
  readonly memoryAlertThreshold: number
  /** 磁盘告警阈值（百分比） */
  readonly diskAlertThreshold: number
  /** GPU 告警阈值（百分比） */
  readonly gpuAlertThreshold: number
  /** 降频策略配置 */
  readonly throttle: {
    /** 进入 AWARE 等级的 CPU 阈值 */
    readonly awareThreshold: number
    /** 进入 DEGRADED 等级的 CPU 阈值 */
    readonly degradedThreshold: number
    /** 进入 LOW_POWER 等级的 CPU 阈值 */
    readonly lowPowerThreshold: number
    /** 冷却时间（毫秒），避免频繁切换 */
    readonly cooldownMs: number
  }
}

/** 性能监控器接口 */
export interface IPerformanceMonitor {
  /** 启动监控 */
  start(): void
  /** 停止监控 */
  stop(): void
  /** 获取最新快照 */
  getLatestSnapshot(): SystemResourceSnapshot | null
  /** 获取历史记录 */
  getHistory(count?: number): readonly SystemResourceSnapshot[]
  /** 注册模块资源声明 */
  registerModule(declaration: ModuleResourceDeclaration): void
  /** 注销模块 */
  unregisterModule(moduleId: string): void
  /** 获取当前降频等级 */
  getThrottleLevel(): ThrottleLevel
  /** 获取趋势预测 */
  predictTrend(resourceType: 'cpu' | 'memory' | 'disk' | 'gpu', steps?: number): TrendPrediction
  /** 导出历史数据 */
  exportHistory(format: 'json' | 'csv'): string
  /** 更新配置 */
  updateConfig(config: Partial<PerformanceMonitorConfig>): void
  /** 注册事件监听 */
  onEvent(handler: (event: PerformanceEvent) => void): () => void
}
