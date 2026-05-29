/**
 * Live2D Cubism 5 模块类型定义
 * 原生渲染，不依赖 pixi.js
 */

/** Cubism 5 模型配置 */
export interface Cubism5ModelConfig {
  readonly name: string
  readonly modelPath: string
  readonly scale?: number
  readonly offsetX?: number
  readonly offsetY?: number
}

/** Cubism 5 模型状态 */
export type Cubism5ModelState = 'idle' | 'loading' | 'loaded' | 'error'

/** 状态变更回调 */
export type StateCallback = (state: Cubism5ModelState) => void

/** 动作分组信息 */
export interface MotionGroup {
  readonly group: string
  readonly names: string[]
}

/** 模型注册表条目 */
export interface RegisteredModelEntry {
  name: string
  path: string
  applied: boolean
  addedAt: number
  version?: number
  textures?: number
  expressions?: number
  motions?: number
  motionGroups?: string[]
  hasPhysics?: boolean
  hasPose?: boolean
  scale?: number
}

/** IPC 通道映射 */
export interface Live2D5IPCChannels {
  'live2d5:create-window': () => Promise<void>
  'live2d5:close-window': () => Promise<void>
  'live2d5:get-status': () => Promise<{ windowOpen: boolean }>
  'live2d5:start-drag': () => Promise<void>
  'live2d5:request-drag': () => Promise<void>
  'live2d5:cleanup-done': () => void
  'live2d5_open': () => Promise<{ success: boolean; message?: string; error?: string }>
  'live2d5_close': () => Promise<{ success: boolean; message?: string; error?: string }>
  'live2d5_status': () => Promise<{ success: boolean; data: { windowOpen: boolean } }>
  'live2d5_motion': (args: { motionId: string }) => Promise<{ success: boolean; message: string }>
  'live2d5_start_drag': () => Promise<{ success: boolean }>
  'live2d5_switch_model': (args: { name: string }) => Promise<{ success: boolean; error?: string }>
  'live2d5_unload_model': (args: { name: string }) => Promise<{ success: boolean; error?: string }>
  'live2d5_switch_to_microphone': () => Promise<{ success: boolean; error?: string }>
  'live2d5_switch_to_wav': (args: { filePath: string }) => Promise<{ success: boolean; error?: string }>
  'live2d5_stop_audio': () => Promise<{ success: boolean; error?: string }>
  'live2d5_set_fps': (args: { fps: number }) => Promise<{ success: boolean; error?: string }>
  'live2d5_reload_model': () => Promise<{ success: boolean; error?: string }>
  'live2d5_set_bubble': (args: { text: string | null }) => Promise<{ success: boolean; error?: string }>
  'live2d5_get_registered_models': () => Promise<{ success: boolean; data: RegisteredModelEntry[] }>
  'live2d5_get_applied_model': () => Promise<{ success: boolean; data: RegisteredModelEntry | null }>
  'live2d5_register_models': (args: { models: RegisteredModelEntry[] }) => Promise<{ success: boolean; data: RegisteredModelEntry[]; added: number }>
  'live2d5_apply_model': (args: { path: string }) => Promise<{ success: boolean; data?: RegisteredModelEntry[]; error?: string }>
  'live2d5_unregister_model': (args: { path: string }) => Promise<{ success: boolean; data?: RegisteredModelEntry[]; error?: string }>
  'live2d5_set_scale': (args: { path: string; scale: number }) => Promise<{ success: boolean; scale?: number; error?: string }>
  'live2d5_call': (args: { code: string }) => Promise<{ success: boolean; data?: unknown; error?: string }>
}
