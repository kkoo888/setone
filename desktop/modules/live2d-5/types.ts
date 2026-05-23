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

/** 模型文件引用（model3.json 结构） */
export interface Cubism3FileReferences {
  readonly Moc: string
  readonly Textures?: readonly string[]
  readonly Expressions?: readonly Array<{ readonly Name: string; readonly File: string }>
  readonly Motions?: Record<string, readonly Array<{ readonly File: string }>>
}

/** Cubism 3 模型 JSON 顶层结构 */
export interface Cubism3ModelJson {
  readonly Version: number
  readonly FileReferences: Cubism3FileReferences
  readonly Groups?: readonly unknown[]
}

/** Cubism Framework 接口 */
export interface CubismFrameworkLike {
  startUp?: () => void
  initialize?: () => void
}

/** Moc 对象接口 */
export interface CubismMocLike {
  createModel: () => CubismModelLike | null
  release: () => void
}

/** Model 对象接口 */
export interface CubismModelLike {
  getModel: () => CubismModelInternalLike
  update: () => void
  saveParameters: () => void
  getCanvasWidth: () => number
  getCanvasHeight: () => number
  setTexture: (index: number, texture: WebGLTexture) => void
  getRenderer: () => CubismRendererLike | null
  setRenderer: (renderer: CubismRendererLike) => void
  release: () => void
}

/** 内部 Model 对象接口（匹配 CubismModel 实际 API） */
export interface CubismModelInternalLike {
  setPixelSize: (width: number, height: number) => void
  update: () => void
  getParameterCount: () => number
  getParameterIds: () => string[]
  getCanvasWidth: () => number
  getCanvasHeight: () => number
}

/** Renderer 对象接口（匹配 Cubism SDK 实际 API） */
export interface CubismRendererLike {
  initialize: (model: CubismModelInternalLike, maskBufferCount?: number) => void
  startUp: (gl: WebGLRenderingContext | WebGL2RenderingContext) => void
  isPremultipliedAlpha: boolean
  setMvpMatrix: (matrix: Float32Array) => void
  drawModel: () => void
  release: () => void
}

/** 宠物窗口状态 */
export interface Live2D5PetState {
  readonly loaded: boolean
  readonly mouseTracking: boolean
  readonly clickInteraction: boolean
  readonly currentExpression: string
  readonly currentMotion: string
  readonly expressions: string[]
  readonly motions: readonly MotionGroup[]
  readonly messageText: string
  readonly lipSyncActive: boolean
  readonly contextLost: boolean
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
  'live2d5_expression': (args: { expressionId: string }) => Promise<{ success: boolean; message: string }>
  'live2d5_motion': (args: { motionId: string }) => Promise<{ success: boolean; message: string }>
  'live2d5_start_drag': () => Promise<{ success: boolean }>
  'live2d5_get_models': () => Promise<{ success: boolean; data: Array<{ name: string; active: boolean; expressions: string[]; motionGroups: string[] }> }>
  'live2d5_switch_model': (args: { name: string }) => Promise<{ success: boolean; error?: string }>
  'live2d5_unload_model': (args: { name: string }) => Promise<{ success: boolean; error?: string }>
  'live2d5_get_live_status': () => Promise<{
    success: boolean
    data: {
      sdkLoaded: boolean
      contextLost: boolean
      mouseTracking: boolean
      clickInteraction: boolean
      currentExpression: string
      currentMotion: string
      lipSyncActive: boolean
      bubbleText: string
    }
  }>
  'live2d5_get_preview': () => Promise<{ success: boolean; data: string | null }>
  'live2d5_get_motion_queue': () => Promise<{ success: boolean; data: { isFinished: boolean; queueLength: number; currentPriority: number } | null }>
  'live2d5_switch_to_microphone': () => Promise<{ success: boolean; error?: string }>
  'live2d5_switch_to_wav': (args: { filePath: string }) => Promise<{ success: boolean; error?: string }>
  'live2d5_stop_audio': () => Promise<{ success: boolean; error?: string }>
  'live2d5_get_audio_type': () => Promise<{ success: boolean; data: 'microphone' | 'wav' | 'none' }>
  'live2d5_set_fps': (args: { fps: number }) => Promise<{ success: boolean; error?: string }>
  'live2d5_get_fps': () => Promise<{ success: boolean; data: number }>
  'live2d5_reload_model': () => Promise<{ success: boolean; error?: string }>
}
