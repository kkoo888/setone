/**
 * Live2D Easy Control 服务
 * 封装 live2d-easy-control 库的所有功能
 * 用于桌面宠物窗口的模型控制
 */

// live2d-easy-control 的类型声明
interface Live2DEasyControlAPI {
  load: (config: string | object) => Promise<void>
  stop: () => Promise<void>
  setPointMovedEvent: () => Promise<void>
  removePointMovedEvent: () => Promise<void>
  setPointClickEvent: () => Promise<void>
  removePointClickEvent: () => Promise<void>
  getAllMotionsInfo: () => Promise<Array<{ group: string; names: string[] }>>
  getAllExpressionsInfo: () => Promise<string[]>
  getDefine: () => Promise<Record<string, unknown>>
  getMotion: () => Promise<Record<string, unknown>>
  getExpression: () => Promise<Record<string, unknown>>
  playMotion: (group: string, no: number, priority: number) => Promise<void>
  playExpression: (name: string) => Promise<void>
  stopExpression: () => Promise<void>
  setAngle: (e: MouseEvent, duration?: number) => Promise<void>
  setAngleXY: (X: number, Y: number, duration?: number) => Promise<void>
  reSetAngle: () => Promise<void>
  setMessage: (message: string, duration?: number) => Promise<void>
  hideMessageBox: () => Promise<void>
  setLipSync: (value: number) => Promise<void>
  setLipSyncWithWeight?: (value: number, weight: number) => Promise<void>
}

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

class Live2DEasyControlService {
  private api: Live2DEasyControlAPI | null = null
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
      // 动态导入（避免 SSR 问题）
      const mod = await import('live2d-easy-control')
      this.api = mod as unknown as Live2DEasyControlAPI
      await this.api.load(config)
      this.loaded = true

      // 获取模型信息
      try {
        this.expressions = await this.api.getAllExpressionsInfo()
      } catch { this.expressions = [] }
      try {
        this.motions = await this.api.getAllMotionsInfo()
      } catch { this.motions = [] }

      // 默认开启鼠标跟随和点击交互
      await this.enableMouseTracking()
      await this.enableClickInteraction()

      this.notify()
    } catch (err) {
      console.error('[Live2DEasyControl] 加载失败:', err)
      throw err
    }
  }

  /** 停止渲染 */
  async stop(): Promise<void> {
    this.stopLipSync()
    await this.api?.stop()
    this.loaded = false
    this.api = null
    this.notify()
  }

  // ========== 鼠标交互 ==========

  /** 开启鼠标跟随（眼睛/头部跟随鼠标） */
  async enableMouseTracking(): Promise<void> {
    await this.api?.setPointMovedEvent()
    this.mouseTracking = true
    this.notify()
  }

  /** 关闭鼠标跟随 */
  async disableMouseInteraction(): Promise<void> {
    await this.api?.removePointMovedEvent()
    this.mouseTracking = false
    this.notify()
  }

  /** 开启点击交互（点击切换表情/动作） */
  async enableClickInteraction(): Promise<void> {
    await this.api?.setPointClickEvent()
    this.clickInteraction = true
    this.notify()
  }

  /** 关闭点击交互 */
  async disableClickInteraction(): Promise<void> {
    await this.api?.removePointClickEvent()
    this.clickInteraction = false
    this.notify()
  }

  // ========== 表情控制 ==========

  /** 播放指定表情 */
  async playExpression(name: string): Promise<void> {
    await this.api?.playExpression(name)
    this.currentExpression = name
    this.notify()
  }

  /** 停止当前表情（回到默认） */
  async stopExpression(): Promise<void> {
    await this.api?.stopExpression()
    this.currentExpression = ''
    this.notify()
  }

  /** 获取所有表情列表 */
  getExpressions(): string[] {
    return this.expressions
  }

  // ========== 动作控制 ==========

  /** 播放指定动作 */
  async playMotion(group: string, no: number, priority: number = 2): Promise<void> {
    await this.api?.playMotion(group, no, priority)
    this.currentMotion = `${group}[${no}]`
    this.notify()
  }

  /** 获取所有动作信息 */
  getMotions(): Array<{ group: string; names: string[] }> {
    return this.motions
  }

  // ========== 模型朝向 ==========

  /** 根据坐标设置朝向 */
  async setAngle(x: number, y: number, duration?: number): Promise<void> {
    await this.api?.setAngleXY(x, y, duration)
  }

  /** 恢复默认朝向 */
  async resetAngle(): Promise<void> {
    await this.api?.reSetAngle()
  }

  // ========== 对话气泡 ==========

  /** 显示对话气泡 */
  async setMessage(message: string, duration?: number): Promise<void> {
    await this.api?.setMessage(message, duration)
    this.messageText = message
    this.notify()
  }

  /** 隐藏对话气泡 */
  async hideMessage(): Promise<void> {
    await this.api?.hideMessageBox()
    this.messageText = ''
    this.notify()
  }

  // ========== 嘴型同步 ==========

  /** 设置嘴型（0.0~0.5） */
  async setLipSync(value: number): Promise<void> {
    await this.api?.setLipSync(value)
    this.lipSyncActive = value > 0
    this.notify()
  }

  /** 开始嘴型同步（配合 TTS 语音，模拟说话） */
  startLipSync(intervalMs: number = 100): void {
    this.stopLipSync()
    let phase = 0
    this.lipSyncTimer = setInterval(() => {
      // 模拟说话的嘴型变化
      const value = Math.abs(Math.sin(phase)) * 0.4
      this.api?.setLipSync(value)
      phase += 0.3
    }, intervalMs)
    this.lipSyncActive = true
    this.notify()
  }

  /** 停止嘴型同步 */
  stopLipSync(): void {
    if (this.lipSyncTimer) {
      clearInterval(this.lipSyncTimer)
      this.lipSyncTimer = null
    }
    this.api?.setLipSync(0)
    this.lipSyncActive = false
    this.notify()
  }

  // ========== 信息查询 ==========

  /** 获取当前配置 */
  async getDefine(): Promise<Record<string, unknown>> {
    return (await this.api?.getDefine()) ?? {}
  }

  /** 获取当前动作信息 */
  async getCurrentMotion(): Promise<Record<string, unknown>> {
    return (await this.api?.getMotion()) ?? {}
  }

  /** 获取当前表情信息 */
  async getCurrentExpression(): Promise<Record<string, unknown>> {
    return (await this.api?.getExpression()) ?? {}
  }
}

// 单例导出
export const live2dEasyControl = new Live2DEasyControlService()
