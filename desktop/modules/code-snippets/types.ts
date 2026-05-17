/** 代码片段 */
export interface Snippet {
  id: string
  title: string
  language: string
  code: string
  description: string
  tags: string[]
  createdAt: number
  usageCount: number
}

/** 创建代码片段参数 */
export interface SnippetCreateParams {
  title: string
  language: string
  code: string
  description?: string
  tags?: string[]
}

/** 更新代码片段参数 */
export interface SnippetUpdateParams {
  id: string
  title?: string
  language?: string
  code?: string
  description?: string
  tags?: string[]
}

/** 删除/使用代码片段参数 */
export interface SnippetIdParams {
  id: string
}
