export { DatabaseManager } from './database'
export { BackupManager } from './backup'
export { ConfigManagerImpl } from './config-manager'

/**
 * 事件总线模块统一导出
 */
export { GlobalEventBus } from './event-bus'
export { ModuleScopedEventBus, createScopedEventBus } from './scoped-event-bus'

/**
 * 模块管理器统一导出
 */
export { ModuleManager } from './module-manager'
export { ModuleLoader } from './module-loader'
export { ModuleScanner } from './module-scanner'
export { ModuleValidator } from './module-validator'
export { DependencyResolver } from './dependency-resolver'

// 类型导出
export type { EventBus, ScopedEventBus, EventHandler, EventMap } from '../types/event'
export type { ScannedModule } from './module-scanner'
export type { ResolutionResult, DependencyError } from './dependency-resolver'
export type { ValidationResult } from './module-validator'

/**
 * 日志系统统一导出
 */
export { AppLogger, createLogger } from './logger'
export { ConsoleTransport, FileTransport } from './log-transport'
export { LogRotationManager } from './log-rotation'

/**
 * AI 调度器统一导出
 */
export { OllamaAIService } from './ai-service'
export { AIDispatcher } from './ai-dispatcher'
export type { DispatchResult } from './ai-dispatcher'

/**
 * 安全沙箱模块统一导出
 */
export { SandboxManager } from './sandbox'
export { SandboxIPC } from './sandbox-ipc'
export type {
  SandboxInstance,
  SandboxStatus,
  SandboxResourceUsage,
} from './sandbox'
export type { SandboxIPCMessage, PendingRequest } from './sandbox-ipc'

/**
 * 能力仲裁器模块统一导出
 */
export { CapabilityRegistry } from './capability-registry'
export { CapabilityArbiter } from './capability-arbiter'

/**
 * 性能监控模块统一导出（版块26）
 */
export { ResourceCollector } from './resource-collector'
export { ThrottleStrategyEngine } from './throttle-strategy'
export { PerformanceMonitor } from './performance-monitor'
export { ModuleResourceController } from './module-resource-controller'
export type { ModuleControlCallbacks } from './module-resource-controller'

// 性能监控类型导出
export type {
  SystemResourceSnapshot,
  ModuleResourceDeclaration,
  ModuleResourceState,
  TrendPrediction,
  PerformanceEvent,
  PerformanceMonitorConfig,
  IPerformanceMonitor,
} from '../types/performance'
export { ThrottleLevel } from '../types/performance'

/**
 * 数据安全与备份模块统一导出
 */
export {
  SecurityManager,
  EncryptionService,
  IntegrityChecker,
  BackupScheduler,
  DataExporter,
  SECURITY_CONSTANTS,
} from './security'
export type {
  BackupMetadata,
  BackupTrigger,
  BackupScheduleConfig,
  ExportPackage,
  ExportOptions,
  IntegrityCheckResult,
  IntegrityError,
  IntegrityRepair,
  EncryptionConfig,
  SecurityEvents,
} from './security'
