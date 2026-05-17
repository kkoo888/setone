/** 配置管理器接口 */
export interface ConfigManager {
  /** 获取配置值 */
  get<T = unknown>(key: string, defaultValue?: T): Promise<T>

  /** 获取全部配置 */
  getAll(): Promise<Record<string, unknown>>

  /** 设置配置值 */
  set<T = unknown>(key: string, value: T): Promise<void>

  /** 删除配置 */
  delete(key: string): Promise<void>

  /** 获取模块配置 */
  getModuleConfig<T = unknown>(moduleId: string, key: string, defaultValue?: T): Promise<T>

  /** 设置模块配置 */
  setModuleConfig<T = unknown>(moduleId: string, key: string, value: T): Promise<void>

  /** 删除模块配置 */
  deleteModuleConfig(moduleId: string, key: string): Promise<void>

  /** 监听配置变更 */
  onChange(callback: (key: string, value: unknown) => void): () => void
}

/** 全局配置结构 */
export interface GlobalConfig {
  ollama: {
    baseUrl: string
    model: string
    visionModel: string
    embeddingModel: string
    timeout: number
  }
  ui: {
    theme: 'light' | 'dark' | 'system'
    language: string
    live2dModel: string
  }
  modules: {
    enabled: string[]
    disabled: string[]
  }
  security: {
    encryptionEnabled: boolean
    backupRetentionDays: number
  }
  performance: {
    maxMemoryMB: number
    maxCpuPercent: number
    monitoringInterval: number
  }
}
