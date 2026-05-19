/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 主题来源 */
export type ThemeSource = 'builtin' | 'imported' | 'available'

/** 主题 */
export interface Theme {
  id: string
  name: string
  author: string
  description: string
  preview: string
  /** 主题模式：light / dark / system */
  mode: ThemeMode
  /** 覆盖的 CSS 变量 */
  colors: Record<string, string>
  /** 来源：builtin=内置 | imported=已导入 | available=可下载 */
  source: ThemeSource
  active: boolean
}

/** 主题 ID 参数 */
export interface ThemeIdParams {
  id: string
}

/** 导入主题参数 */
export interface ThemeImportParams {
  /** JSON 文件路径（可选，不传则弹出文件选择框） */
  path?: string
}

/** theme:changed 事件数据 */
export interface ThemeChangedEvent {
  themeId: string
  mode: ThemeMode
  colors: Record<string, string>
}
