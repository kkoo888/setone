/** IPC 通道定义（主进程 ↔ 渲染进程） */

import type { ModuleRegistration } from '../../main/types/module'
import type { ChatMessage, ChatResponse, ChatOptions, ChatChunk } from '../../main/types/ai'
import type { LogLevel } from '../../main/types/logger'

/** 屏幕源信息 */
export interface ScreenSource {
  id: string
  name: string
  thumbnail: string
  display_id: string
  appIcon: string | null
  // Live2D 桌面宠物
  'live2d:create-window': { request: void; response: boolean }
  'live2d:close-window': { request: void; response: boolean }
  'live2d:toggle-visibility': { request: void; response: boolean }
}

/** 日志条目 */
export interface LogEntry {
  timestamp: string
  level: string
  moduleId: string
  message: string
  error?: { name: string; message: string; stack?: string }
  meta?: object
  // Live2D 桌面宠物
  'live2d:create-window': { request: void; response: boolean }
  'live2d:close-window': { request: void; response: boolean }
  'live2d:toggle-visibility': { request: void; response: boolean }
}

export interface IPCChannels {
  // 模块管理
  'module:list': { request: void; response: ModuleRegistration[] }
  'module:enable': { request: { moduleId: string }; response: boolean }
  'module:disable': { request: { moduleId: string }; response: boolean }
  'module:reload': { request: { moduleId: string }; response: boolean }

  // 配置
  'config:get': { request: { key: string }; response: unknown }
  'config:set': { request: { key: string; value: unknown }; response: { success: boolean } }

  // AI 对话
  'ai:chat': { request: { messages: ChatMessage[] }; response: ChatResponse }
  'ai:chatStream': {
    request: { requestId: string; messages: ChatMessage[]; options?: ChatOptions }
    response: void
  }

  // 屏幕
  'screen:sources': { request: void; response: ScreenSource[] }
  'vision:toggle': { request: { enabled: boolean; mode?: string }; response: boolean }

  // 日志
  'log:query': { request: { moduleId?: string; level?: LogLevel }; response: LogEntry[] }

  // AI 对话
  'ai:chat': { request: { messages: Array<{ role: string; content: string; images?: string[] }> }; response: { response: string; toolCalls?: Array<{ id: string; name: string; arguments?: Record<string, unknown>; result?: unknown; error?: string; status?: 'running' | 'success' | 'error'; durationMs?: number }> } }

  // Ollama
  'ollama:listModels': { request: void; response: { success: boolean; models: Array<{ name: string; size: number; modified: string }> } }

  // 性能
  'performance:snapshot': { request: void; response: { cpu: number; memory: number; memoryUsedMB: number; memoryTotalMB: number } }

  // Git
  'git:status': { request: void; response: Array<{ path: string; status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'; staged: boolean }> }
  'git:diff': { request: { file: string }; response: string }

  // 文件浏览
  'files:list': { request: void; response: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }> }
  'files:read': { request: { path: string }; response: { content: string; language: string; isMarkdown: boolean; tooLarge?: boolean } }

  // 技能模块
  'skill:list': { request: void; response: unknown }
  'skill:discover': { request: { dirs: string[] }; response: unknown }
  'skill:toggle': { request: { id: string; active: boolean }; response: unknown }
  'skill:create': { request: Record<string, unknown>; response: unknown }
  'skill:refine': { request: { id: string; instruction: string }; response: unknown }
  'skill:delete': { request: { id: string }; response: unknown }
  'skill:scan': { request: { path: string }; response: unknown }
  'skill:config': { request: { id: string; config?: Record<string, unknown> }; response: unknown }
  'skill:stats': { request: { id?: string }; response: unknown }

  // Live2D 桌面宠物
  'live2d:create-window': { request: void; response: boolean }
  'live2d:close-window': { request: void; response: boolean }
  'live2d:toggle-visibility': { request: void; response: boolean }

  // SOUL 人格系统
  'soul:initialize': { request: void; response: { status: 'none' | 'ready'; soul: unknown | null } }
  'soul:get': { request: void; response: unknown | null }
  'soul:create': { request: Record<string, unknown>; response: unknown }
  'soul:update': { request: Record<string, unknown>; response: unknown }
  'soul:reset': { request: void; response: { success: boolean } }
}
