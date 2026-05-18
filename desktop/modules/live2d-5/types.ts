/**
 * Live2D Cubism 5 模块类型定义
 * 原生渲染，不依赖 pixi.js
 */

/** Cubism 5 模型配置 */
export interface Cubism5ModelConfig {
  readonly name: string
  readonly modelPath: string
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
}

/** Cubism 5 模型状态 */
export type Cubism5ModelState = 'idle' | 'loading' | 'loaded' | 'error'

/** 宠物窗口状态 */
export interface Live2D5PetState {
  readonly loaded: boolean
  readonly mouseTracking: boolean
  readonly clickInteraction: boolean
  readonly currentExpression: string
  readonly currentMotion: string
  readonly expressions: string[]
  readonly motions: Array<{ group: string; names: string[] }>
  readonly messageText: string
  readonly lipSyncActive: boolean
}

/** IPC 通道映射 */
export interface Live2D5IPCChannels {
  'live2d5:create-window': () => Promise<void>
  'live2d5:close-window': () => Promise<void>
  'live2d5:get-status': () => Promise<{ windowOpen: boolean }>
  'live2d5:start-drag': () => Promise<void>
}
