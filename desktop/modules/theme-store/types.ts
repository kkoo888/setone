/** 主题 */
export interface Theme {
  id: string
  name: string
  author: string
  description: string
  preview: string
  colors: Record<string, string>
  installed: boolean
  active: boolean
}

/** 主题 ID 参数 */
export interface ThemeIdParams {
  id: string
}
