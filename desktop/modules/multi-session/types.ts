/** 会话 */
export interface Session {
  id: string
  name: string
  model: string
  messageCount: number
  createdAt: number
  lastActiveAt: number
  pinned: boolean
}

/** 创建会话参数 */
export interface SessionCreateParams {
  name?: string
  model?: string
}

/** 切换/删除/固定会话参数 */
export interface SessionIdParams {
  id: string
}

/** 重命名会话参数 */
export interface SessionRenameParams {
  id: string
  name: string
}
