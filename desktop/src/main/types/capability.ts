/** 能力实例（运行时） */
export interface Capability {
  type: 'tool' | 'event' | 'ui' | 'service'
  name: string
  description: string
  priority: number
  moduleId: string
  handler?: CapabilityHandler
}

/** 工具类型能力的执行函数 */
export interface CapabilityHandler {
  execute(params: Record<string, unknown>): Promise<CapabilityResult>
  validate?(params: Record<string, unknown>): boolean
}

/** 能力执行结果 */
export interface CapabilityResult {
  success: boolean
  data?: unknown
  error?: string
  errorCode?: number
}

/** 能力仲裁请求 */
export interface ArbitrationRequest {
  capabilityName: string
  params: Record<string, unknown>
  requesterModuleId?: string
}

/** 仲裁结果 */
export interface ArbitrationResult {
  selectedModuleId: string
  capability: Capability
  reason: 'user_override' | 'priority' | 'load_order' | 'user_selection'
}
