/**
 * 设置面板相关类型定义
 * 版块25 - 设置面板增强
 */

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 支持的语言 */
export type Language = 'zh-CN' | 'en-US' | 'ja-JP'

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Ollama 连接配置 */
export interface OllamaConfig {
  /** Ollama 服务地址 */
  readonly baseUrl: string
  /** 默认模型名称 */
  readonly model: string
  /** 视觉模型名称 */
  readonly visionModel: string
  /** 嵌入模型名称 */
  readonly embeddingModel: string
  /** 请求超时时间（毫秒） */
  readonly timeout: number
  /** 是否自动启动 Ollama */
  readonly autoStart: boolean
}

/** 外观设置 */
export interface AppearanceSettings {
  /** 主题模式 */
  readonly theme: ThemeMode
  /** 语言 */
  readonly language: Language
  /** 字体大小（px） */
  readonly fontSize: number
  /** 侧边栏折叠状态 */
  readonly sidebarCollapsed: boolean
}

/** 性能监控设置（渲染进程侧） */
export interface PerformanceMonitorSettings {
  /** 是否启用性能监控 */
  readonly enabled: boolean
  /** 采集间隔（毫秒） */
  readonly interval: number
  /** CPU 告警阈值（百分比） */
  readonly cpuAlertThreshold: number
  /** 内存告警阈值（百分比） */
  readonly memoryAlertThreshold: number
  /** 是否在状态栏显示资源使用 */
  readonly showInStatusBar: boolean
}

/** 完整应用设置 */
export interface AppSettings {
  /** 自定义头像（base64 data URL，空字符串表示使用默认 emoji） */
  readonly avatar: string
  /** AI 相关设置 */
  readonly ai: {
    readonly provider: string
    readonly model: string
    readonly apiKey: string
    readonly baseUrl: string
    readonly temperature: number
    readonly maxTokens: number
  }
  /** Ollama 配置 */
  readonly ollama: OllamaConfig
  /** 外观设置 */
  readonly appearance: AppearanceSettings
  /** 通用设置 */
  readonly general: {
    readonly autostart: boolean
    readonly minimizeToTray: boolean
    readonly showNotifications: boolean
    readonly logLevel: LogLevel
  }
  /** 性能监控设置 */
  readonly performanceMonitor: PerformanceMonitorSettings
  /** 网络控制：false = 一键断网，禁止所有技能和商店的外网请求 */
  readonly networkEnabled: boolean
  /** 助手显示名称（用于 UI 中的称呼） */
  readonly assistantName: string
}

/** 设置区块属性 */
export interface SettingsSectionProps {
  /** 区块标题 */
  readonly title: string
  /** 区块描述 */
  readonly description?: string
  /** 子元素 */
  readonly children: React.ReactNode
  /** 图标 */
  readonly icon?: string
}
