/** 模块元数据（来自 module.json） */
export interface ModuleMeta {
  id: string
  name: string
  version: string
  description: string
  author: string
  enabled: boolean
  dependencies: string[]
  hostVersion: string
  priority: number
  resourceLimits: ResourceLimits
  provides: CapabilityDeclaration[]
  consumes: ConsumesDeclaration[]
  settings: Record<string, unknown>
}

/** 资源限制 */
export interface ResourceLimits {
  maxMemoryMB: number
  maxCpuPercent: number
}

/** 能力声明（module.json 中的 provides） */
export interface CapabilityDeclaration {
  type: 'tool' | 'event' | 'ui' | 'service'
  name: string
  description: string
  priority?: number
}

/** 消费声明（module.json 中的 consumes） */
export interface ConsumesDeclaration {
  type: 'event'
  name: string
  from?: string
}

/** 模块接口 */
export interface Module {
  id: string
  meta: ModuleMeta

  /** 激活模块 */
  activate(context: ModuleContext): Promise<void>

  /** 停用模块 */
  deactivate(): Promise<void>

  /** 获取能力列表 */
  getCapabilities(): Capability[]

  /** 获取 UI 组件（可选） */
  getUI?(): React.ComponentType

  /** 获取模块状态（可选） */
  getStatus?(): ModuleStatusReport
}

/**
 * 模块运行时值（纯数据，由框架注入，模块只读使用）
 */
export interface ModuleRuntimeValues {
  /** 应用数据目录 */
  dataDir: string
  /** 应用安装目录 */
  appDir: string
  /** 默认 LLM 模型名称 */
  defaultModel: string
  /** 默认城市（用于天气等模块） */
  defaultCity: string
  /** 额外技能搜索路径 */
  skillSearchPaths: string[]
  /** 任务最大重试次数 */
  taskMaxRetries: number
}

/**
 * 模块运行时配置（组合式设计：运行时值 + 配置管理器）
 */
export type ModuleRuntimeConfig = ModuleRuntimeValues & ConfigManager

/** 模块上下文（注入给模块的服务） */
export interface ModuleContext {
  eventBus: ScopedEventBus
  config: ModuleRuntimeConfig
  ai: AIService
  /** LLM 快捷访问 */
  llm: {
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>
  }
  logger: Logger
  store: ScopedStore
  /** 数据库实例（SQLite） */
  db: DatabaseManager

  /** 获取其他已注册模块实例 */
  getModule(name: string): Module | undefined
}

/**
 * 模块运行时状态报告
 */
export interface ModuleStatusReport {
  id: string
  state: ModuleStatus
  message?: string
  resourceUsage?: {
    memoryMB: number
    cpuPercent: number
  }
}

/** 模块注册信息 */
export interface ModuleRegistration {
  meta: ModuleMeta
  instance: Module | null
  status: ModuleRegistrationStatus
  loadError?: string
  hash: string
  path: string
}

/**
 * 模块注册状态（主进程模块管理器使用）
 */
export type ModuleRegistrationStatus =
  | 'discovered'
  | 'loading'
  | 'active'
  | 'error'
  | 'disabled'
  | 'incompatible'

/**
 * 模块状态枚举
 */
export enum ModuleStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  STOPPED = 'stopped',
  ERROR = 'error',
  LOADING = 'loading',
  DISABLED = 'disabled',
}

/**
 * 模块信息（统一版）
 */
export interface ModuleInfo {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version: string
  readonly author: string
  readonly status: ModuleStatus
  readonly enabled: boolean
  readonly icon: string
  readonly dependencies: readonly string[]
  readonly hostVersion: string
  readonly priority: number
  readonly resourceLimits: ResourceLimits
  readonly provides: readonly CapabilityDeclaration[]
  readonly consumes: readonly ConsumesDeclaration[]
  readonly settings: Record<string, unknown>
  readonly lastUpdated: string
}

// 导入依赖类型（避免循环引用，使用 import type）
import type { ConfigManager } from './config'
import type { AIService, ChatMessage, ChatOptions, ChatResponse } from './ai'
import type { Logger } from './logger'
import type { ScopedStore } from './store'
import type { ScopedEventBus } from './event'
import type { Capability } from './capability'
import type { DatabaseManager } from './database'
