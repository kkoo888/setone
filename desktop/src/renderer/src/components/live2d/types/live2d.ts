/** Live2D 模型配置 */
export interface Live2DModelConfig {
  readonly name: string
  readonly modelPath: string
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
}

/** 表情定义 */
export interface ExpressionDefinition {
  readonly id: string
  readonly name: string
  readonly expressionFile: string
  readonly durationMs: number
}

/** 动作定义 */
export interface MotionDefinition {
  readonly id: string
  readonly name: string
  readonly group: string
  readonly index: number
  readonly priority: MotionPriority
}

export enum MotionPriority {
  NONE = 0,
  IDLE = 1,
  NORMAL = 2,
  FORCE = 3,
}

export enum Live2DStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
  FALLBACK = 'fallback',
}

export interface Live2DState {
  readonly status: Live2DStatus
  readonly currentModel: Live2DModelConfig | null
  readonly expressions: readonly ExpressionDefinition[]
  readonly motions: readonly MotionDefinition[]
  readonly currentExpression: string | null
  readonly errorMessage: string | null
  readonly mouseTrackingEnabled: boolean
}

export interface ILive2DManager {
  loadModel(config: Live2DModelConfig): Promise<void>
  setExpression(expressionId: string): Promise<void>
  playMotion(motionId: string): Promise<void>
  setMouseTracking(enabled: boolean): void
  updateMousePosition(x: number, y: number): void
  destroy(): void
  getStatus(): Live2DStatus
}
