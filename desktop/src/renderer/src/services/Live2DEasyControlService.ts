/**
 * Live2D Easy Control 服务
 * 封装 live2d-easy-control 库的所有功能
 * 用于桌面宠物窗口的模型控制
 *
 * 注意：live2d-easy-control 是 CommonJS 模块，所有函数都是命名导出
 * Vite 的 CJS 互操作可能导致 import() 返回的模块结构不同
 * 因此直接从模块对象上取函数调用，避免类型转换问题
 */

/** 宠物状态 */
export interface Live2DPetState {
  loaded: boolean
  mouseTracking: boolean
  clickInteraction: boolean
  currentExpression: string
  currentMotion: string
  expressions: string[]
  motions: Array<{ group: string; names: string[] }>
  messageText: string
  lipSyncActive: boolean
}

/** 状态变更回调 */
type StateChangeCallback = (state: Live2DPetState) => void

/** 从模块中安全获取函数 */
function getFn(mod: any, name: string): ((...args: any[]) => Promise<any>) | null {
  // 直接命名导出
  if (typeof mod[name] === 'function') return mod[name]
  // CJS default export 上
  if (mod.default && typeof mod.default[name] === 'function') return mod.default[name]
  // 整个 module.exports 就是函数集合
  if (typeof mod === 'object' && mod !== null) {
    for (const key of Object.keys(mod)) {
      if (typeof mod[key]?.[name] === 'function') return mod[key][name].bind(mod[key])
    }
  }
  console.warn(`[Live2DEasyControl] 函数 "${name}" 未找到于模块中, keys:`, Object.keys(mod))
  return null
}

class Live2DEasyControlService {
  private mod: any = null
  private loaded = false
  private mouseTracking = false
  private clickInteraction = false
  private currentExpression = ''
  private currentMotion = ''
  private expressions: string[] = []
  private motions: Array<{ group: string; names: string[] }> = []
  private messageText = ''
  private lipSyncActive = false
  private onStateChange: StateChangeCallback | null = null
  private lipSyncTimer: ReturnType<typeof setInterval> | null = null

  /** 注册状态变更回调 */
  setStateChangeCallback(cb: StateChangeCallback | null) {
    this.onStateChange = cb
  }

  /** 通知状态变更 */
  private notify() {
    this.onStateChange?.(this.getState())
  }

  /** 获取当前状态 */
  getState(): Live2DPetState {
    return {
      loaded: this.loaded,
      mouseTracking: this.mouseTracking,
      clickInteraction: this.clickInteraction,
      currentExpression: this.currentExpression,
      currentMotion: this.currentMotion,
      expressions: this.expressions,
      motions: this.motions,
      messageText: this.messageText,
      lipSyncActive: this.lipSyncActive,
    }
  }

  /** 加载模型 */
  async load(config: string | object): Promise<void> {
    try {
      console.log('[Live2DEasyControl] 📦 开始导入 live2d-easy-control...')
      this.mod = await import('live2d-easy-control')
      console.log('[Live2DEasyControl] 模块导入完成')
      console.log('[Live2DEasyControl] mod keys:', Object.keys(this.mod))
      console.log('[Live2DEasyControl] mod.default:', this.mod.default)
      console.log('[Live2DEasyControl] mod.load 类型:', typeof this.mod.load)

      const loadFn = getFn(this.mod, 'load')
      if (!loadFn) {
        throw new Error('live2d-easy-control 的 load 函数未找到，请检查库版本')
      }

      console.log('[Live2DEasyControl] 调用 load(config)...')
      await loadFn(config)
      console.log('[Live2DEasyControl] ✅ load() 完成')
      this.loaded = true

      // 获取模型信息
      const getAllExprFn = getFn(this.mod, 'getAllExpressionsInfo')
      const getAllMotionFn = getFn(this.mod, 'getAllMotionsInfo')
      try {
        if (getAllExprFn) this.expressions = await getAllExprFn()
        console.log('[Live2DEasyControl] 表情列表:', this.expressions)
      } catch (e) { console.warn('[Live2DEasyControl] 获取表情失败:', e); this.expressions = [] }
      try {
        if (getAllMotionFn) this.motions = await getAllMotionFn()
        console.log('[Live2DEasyControl] 动作列表:', this.motions)
      } catch (e) { console.warn('[Live2DEasyControl] 获取动作失败:', e); this.motions = [] }

      // 默认开启鼠标跟随和点击交互
      await this.enableMouseTracking()
      await this.enableClickInteraction()

      this.notify()
    } catch (err) {
      console.error('[Live2DEasyControl] ❌ 加载失败:', err)
      throw err
    }
  }

  /** 停止渲染 */
  async stop(): Promise<void> {
    this.stopLipSync()
    const stopFn = getFn(this.mod, 'stop')
    if (stopFn) await stopFn()
    this.loaded = false
    this.mod = null
    this.notify()
  }

  // ========== 鼠标交互 ==========

  async enableMouseTracking(): Promise<void> {
    const fn = getFn(this.mod, 'setPointMovedEvent')
    if (fn) await fn()
    this.mouseTracking = true
    this.notify()
  }

  async disableMouseInteraction(): Promise<void> {
    const fn = getFn(this.mod, 'removePointMovedEvent')
    if (fn) await fn()
    this.mouseTracking = false
    this.notify()
  }

  async enableClickInteraction(): Promise<void> {
    const fn = getFn(this.mod, 'setPointClickEvent')
    if (fn) await fn()
    this.clickInteraction = true
    this.notify()
  }

  async disableClickInteraction(): Promise<void> {
    const fn = getFn(this.mod, 'removePointClickEvent')
    if (fn) await fn()
    this.clickInteraction = false
    this.notify()
  }

  // ========== 表情控制 ==========

  async playExpression(name: string): Promise<void> {
    const fn = getFn(this.mod, 'playExpression')
    if (fn) await fn(name)
    this.currentExpression = name
    this.notify()
  }

  async stopExpression(): Promise<void> {
    const fn = getFn(this.mod, 'stopExpression')
    if (fn) await fn()
    this.currentExpression = ''
    this.notify()
  }

  getExpressions(): string[] {
    return this.expressions
  }

  // ========== 动作控制 ==========

  async playMotion(group: string, no: number, priority: number = 2): Promise<void> {
    const fn = getFn(this.mod, 'playMotion')
    if (fn) await fn(group, no, priority)
    this.currentMotion = `${group}[${no}]`
    this.notify()
  }

  getMotions(): Array<{ group: string; names: string[] }> {
    return this.motions
  }

  // ========== 模型朝向 ==========

  async setAngle(x: number, y: number, duration?: number): Promise<void> {
    const fn = getFn(this.mod, 'setAngleXY')
    if (fn) await fn(x, y, duration)
  }

  async resetAngle(): Promise<void> {
    const fn = getFn(this.mod, 'reSetAngle')
    if (fn) await fn()
  }

  // ========== 对话气泡 ==========

  async setMessage(message: string, duration?: number): Promise<void> {
    const fn = getFn(this.mod, 'setMessage')
    if (fn) await fn(message, duration)
    this.messageText = message
    this.notify()
  }

  async hideMessage(): Promise<void> {
    const fn = getFn(this.mod, 'hideMessageBox')
    if (fn) await fn()
    this.messageText = ''
    this.notify()
  }

  // ========== 嘴型同步 ==========

  async setLipSync(value: number): Promise<void> {
    const fn = getFn(this.mod, 'setLipSync')
    if (fn) await fn(value)
    this.lipSyncActive = value > 0
    this.notify()
  }

  startLipSync(intervalMs: number = 100): void {
    this.stopLipSync()
    let phase = 0
    this.lipSyncTimer = setInterval(() => {
      const value = Math.abs(Math.sin(phase)) * 0.4
      const fn = getFn(this.mod, 'setLipSync')
      if (fn) fn(value)
      phase += 0.3
    }, intervalMs)
    this.lipSyncActive = true
    this.notify()
  }

  stopLipSync(): void {
    if (this.lipSyncTimer) {
      clearInterval(this.lipSyncTimer)
      this.lipSyncTimer = null
    }
    const fn = getFn(this.mod, 'setLipSync')
    if (fn) fn(0)
    this.lipSyncActive = false
    this.notify()
  }

  // ========== 信息查询 ==========

  async getDefine(): Promise<Record<string, unknown>> {
    const fn = getFn(this.mod, 'getDefine')
    return fn ? await fn() : {}
  }

  async getCurrentMotion(): Promise<Record<string, unknown>> {
    const fn = getFn(this.mod, 'getMotion')
    return fn ? await fn() : {}
  }

  async getCurrentExpression(): Promise<Record<string, unknown>> {
    const fn = getFn(this.mod, 'getExpression')
    return fn ? await fn() : {}
  }
}

// 单例导出
export const live2dEasyControl = new Live2DEasyControlService()
