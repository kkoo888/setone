/**
 * IPC 处理器共享类型定义
 * 所有 handler 模块共用的依赖接口
 */
import type { ConfigManager } from '../types/config'
import type { Logger } from '../types/logger'
import type { GlobalEventBus } from '../core/event-bus'
import type { OllamaAIService } from '../core/ai-service'
import type { DatabaseManager } from '../core/database'
import type { ModuleManager } from '../core/module-manager'
import type { PerformanceMonitor } from '../core/performance-monitor'

/** IPC 处理器共享依赖 */
export interface HandlerDeps {
  config: ConfigManager
  logger: Logger
  eventBus?: GlobalEventBus
  aiService?: OllamaAIService
  db?: DatabaseManager
  moduleManager?: ModuleManager
  performanceMonitor?: PerformanceMonitor
}
