/** 命令条目 */
export interface CommandEntry {
  id: string
  label: string
  description?: string
  keywords: string[]
  category: CommandCategory
  icon?: string
  shortcut?: string
  action: CommandAction
  recentUsedAt?: number
  useCount: number
}

/** 命令分类 */
export type CommandCategory =
  | 'navigation'  // 页面导航
  | 'skill'       // 技能
  | 'module'      // 模块管理
  | 'setting'     // 设置
  | 'file'        // 文件操作
  | 'chat'        // 聊天相关
  | 'tool'        // 工具
  | 'custom'      // 自定义

/** 命令动作 */
export interface CommandAction {
  type: 'navigate' | 'capability' | 'callback' | 'emit'
  /** navigate: 页面ID */
  page?: string
  /** capability: 模块ID + 能力名 + 参数 */
  moduleId?: string
  capabilityName?: string
  params?: Record<string, unknown>
  /** emit: 事件名 + 数据 */
  eventName?: string
  eventData?: unknown
}

/** 搜索结果（带匹配信息） */
export interface CommandSearchResult {
  command: CommandEntry
  score: number
  matchRanges?: Array<[number, number]>
}

/** 命令注册请求 */
export interface RegisterCommandPayload {
  id: string
  label: string
  description?: string
  keywords?: string[]
  category?: CommandCategory
  icon?: string
  shortcut?: string
  action: CommandAction
}
