import type { ILive2DManager, Live2DModelConfig, Live2DStatus } from './types/live2d'

/** pixi-live2d-display 的 Live2DModel 实例接口 */
interface Live2DModelInstance {
  anchor: { set(x: number, y: number): void }
  scale: { set(x: number, y: number): void }
  x: number
  y: number
  internalModel?: {
    coreModel?: unknown
    motionManager?: {
      expressionManager?: {
        setExpression(id: string): boolean
        expressions?: Array<{ name?: string }>
      }
      startMotion?(group: string, index: number, priority: number): unknown
    }
  }
  tap?(hitAreaName: string): void
  destroy(): void
}

/** pixi.js Application 最小接口 */
interface PixiApp {
  stage: {
    addChild(child: unknown): void
    removeChild(child: unknown): void
  }
  canvas?: HTMLCanvasElement
  view?: HTMLCanvasElement
  view: HTMLCanvasElement
  renderer: {
    resize(width: number, height: number): void
    width: number
    height: number
  }
  destroy(removeView?: boolean, stageOptions?: unknown): void
  ticker: { add(fn: (dt: number) => void): void }
}

/** pixi-live2d-display 模块接口 */
interface PixiLive2DModule {
  Live2DModel: {
    from(source: string, options?: unknown): Promise<Live2DModelInstance>
  }
}

/** 等待条件满足，带超时 */
function waitFor(
  condition: () => boolean,
  timeoutMs: number = 10000,
  intervalMs: number = 100
): Promise<boolean> {
  return new Promise((resolve) => {
    if (condition()) {
      resolve(true)
      return
    }
    const start = Date.now()
    const timer = setInterval(() => {
      if (condition()) {
        clearInterval(timer)
        resolve(true)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer)
        resolve(false)
      }
    }, intervalMs)
  })
}

/**
 * Live2D 管理器 - 单例模式
 * 负责 pixi.js Application 和 Live2D 模型的生命周期管理
 */
export class Live2DManager implements ILive2DManager {
  private static instance: Live2DManager | null = null

  private status: Live2DStatus = 'idle' as Live2DStatus
  private onStatusChange: ((status: Live2DStatus) => void) | null = null

  private pixiApp: PixiApp | null = null
  private model: Live2DModelInstance | null = null
  private mouseTrackingEnabled = false

  private constructor() {}

  /** 获取单例实例 */
  static getInstance(): Live2DManager {
    if (!Live2DManager.instance) {
      Live2DManager.instance = new Live2DManager()
    }
    return Live2DManager.instance
  }

  /** 设置状态变更回调 */
  setStatusChangeCallback(callback: (status: Live2DStatus) => void): void {
    this.onStatusChange = callback
  }

  /** 更新状态并通知监听者 */
  private updateStatus(newStatus: Live2DStatus): void {
    this.status = newStatus
    this.onStatusChange?.(newStatus)
  }

  /**
   * 加载 Live2D 模型
   * @param config - 模型配置
   * @param container - 挂载 canvas 的容器元素
   */
  async loadModel(config: Live2DModelConfig, container?: HTMLElement): Promise<void> {
    console.log('[Live2D] 🚀 开始加载模型:', config.name)
    this.updateStatus('loading' as Live2DStatus)

    try {
      // 步骤1: 等待 Cubism SDK 加载（最多等 10 秒）
      console.log('[Live2D] ⏳ 等待 Cubism 4 Core SDK...')
      const sdkReady = await waitFor(
        () => !!(window as unknown as Record<string, unknown>).Live2DCubismCore,
        10000,
        200
      )
      if (!sdkReady) {
        throw new Error('Cubism 4 Core SDK 加载超时。请检查 index.html 中的 live2dcubismcore.min.js 路径')
      }
      console.log('[Live2D] ✅ Cubism SDK 已就绪')

      // 额外等待 Cubism Framework 内部初始化完成
      // SDK 对象存在 ≠ Framework 完全就绪，需要给内部初始化一点时间
      console.log('[Live2D] ⏳ 等待 Framework 内部初始化...')
      await new Promise((resolve) => setTimeout(resolve, 500))

      // 步骤2: 导入 pixi.js 并暴露到全局（pixi-live2d-display 需要）
      console.log('[Live2D] 📦 导入 pixi.js...')
      const PIXI = await import('pixi.js')
      ;(window as unknown as Record<string, unknown>).PIXI = PIXI
      console.log('[Live2D] ✅ pixi.js v' + (PIXI.VERSION ?? '?') + ' 已暴露到全局')

      // 步骤3: 导入 pixi-live2d-display（会自动初始化 Cubism Framework）
      console.log('[Live2D] 📦 导入 pixi-live2d-display/cubism4...')
      let live2dModule: PixiLive2DModule
      try {
        live2dModule = (await import(
          'pixi-live2d-display/cubism4'
        )) as unknown as PixiLive2DModule
      } catch (importErr) {
        console.warn('[Live2D] ⚠️ cubism4 子路径导入失败，尝试主入口...')
        live2dModule = (await import(
          'pixi-live2d-display'
        )) as unknown as PixiLive2DModule
      }
      if (!live2dModule?.Live2DModel?.from) {
        throw new Error('pixi-live2d-display 导入成功但 Live2DModel.from 不可用')
      }
      console.log('[Live2D] ✅ pixi-live2d-display 已就绪')

      // 等待容器有有效尺寸（最多等 3 秒）
      let width = container?.clientWidth ?? 0
      let height = container?.clientHeight ?? 0
      if (container && (width < 10 || height < 10)) {
        console.log('[Live2D] ⏳ 容器尺寸为0，等待渲染...')
        await new Promise<void>((resolve) => {
          let waited = 0
          const timer = setInterval(() => {
            width = container.clientWidth
            height = container.clientHeight
            waited += 100
            if (width >= 10 && height >= 10 || waited >= 3000) {
              clearInterval(timer)
              resolve()
            }
          }, 100)
        })
        width = container.clientWidth || 400
        height = container.clientHeight || 400
      }
      console.log(`[Live2D] 📐 容器尺寸: ${width}x${height}`)

      // 步骤4: 创建 pixi.js Application（v7 API）
      console.log('[Live2D] 🎨 创建 PIXI Application...')
      this.pixiApp = new PIXI.Application({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      }) as unknown as PixiApp
      console.log('[Live2D] ✅ PIXI Application 创建成功')

      // 将 canvas 挂载到容器
      // pixi.js v7 用 app.view，v8 用 app.canvas
      const canvasEl = (this.pixiApp.canvas ?? this.pixiApp.view) as HTMLCanvasElement | undefined
      if (container && canvasEl) {
        container.appendChild(canvasEl)
        console.log('[Live2D] ✅ Canvas 已挂载到容器')
      } else {
        console.warn('[Live2D] ⚠️ 容器或 canvas 不存在，跳过挂载', { container: !!container, canvas: !!canvasEl })
      }

      // 步骤5: 加载 Live2D 模型（带自动重试，Framework 首次初始化可能失败）
      console.log('[Live2D] 📦 加载模型文件:', config.modelPath)
      try {
        this.model = await live2dModule.Live2DModel.from(config.modelPath, {
          autoHitTest: false,
          autoFocus: false,
        })
      } catch (modelErr) {
        console.warn('[Live2D] ⚠️ 首次加载失败，等待 1 秒后重试...')
        await new Promise((resolve) => setTimeout(resolve, 1000))
        this.model = await live2dModule.Live2DModel.from(config.modelPath, {
          autoHitTest: false,
          autoFocus: false,
        })
      }
      console.log('[Live2D] ✅ 模型加载成功')

      // 设置模型属性
      this.model.anchor.set(config.offsetX ?? 0.5, config.offsetY ?? 0.5)
      this.model.scale.set(config.scale ?? 0.15, config.scale ?? 0.15)

      // 居中模型
      const renderer = this.pixiApp.renderer
      this.model.x = renderer.width / 2
      this.model.y = renderer.height / 2

      // 添加到 stage
      this.pixiApp.stage.addChild(this.model)

      // 设置鼠标交互
      this.setupInteraction()

      this.updateStatus('loaded' as Live2DStatus)
      console.log('[Live2D] 🎉 模型加载完成！状态: loaded')
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载 Live2D 模型失败'
      console.error('[Live2D] ❌ 加载失败:', message)
      console.error('[Live2D] 错误详情:', err)
      this.updateStatus('error' as Live2DStatus)
      throw new Error(message)
    }
  }

  /** 设置鼠标/触摸交互 */
  private setupInteraction(): void {
    if (!this.model || !this.pixiApp) return

    const canvas = (this.pixiApp.canvas ?? this.pixiApp.view) as HTMLCanvasElement | undefined
    if (!canvas) return

    // 点击交互
    canvas.addEventListener('click', () => {
      if (!this.model) return
      const tapFn = this.model.tap
      if (typeof tapFn === 'function') {
        tapFn.call(this.model, 'HitArea')
      }
    })
  }

  /**
   * 切换表情
   * @param expressionId - 表情 ID
   */
  async setExpression(expressionId: string): Promise<void> {
    if (!this.model?.internalModel?.motionManager?.expressionManager) {
      return
    }

    const expressionManager = this.model.internalModel.motionManager.expressionManager
    expressionManager.setExpression(expressionId)
  }

  /**
   * 播放动作
   * @param motionId - 动作 ID（格式: "group:index"，如 "Idle:0"）
   */
  async playMotion(motionId: string): Promise<void> {
    if (!this.model?.internalModel?.motionManager?.startMotion) {
      return
    }

    // 解析 motionId: "group:index" 或直接 group 名
    const parts = motionId.split(':')
    const group = parts[0] ?? motionId
    const index = parseInt(parts[1] ?? '0', 10)

    this.model.internalModel.motionManager.startMotion(group, index, 3)
  }

  /**
   * 设置鼠标追踪开关
   * @param enabled - 是否启用
   */
  setMouseTracking(enabled: boolean): void {
    this.mouseTrackingEnabled = enabled
  }

  /**
   * 更新鼠标位置（模型眼睛/头部跟随）
   * @param x - 相对于容器的 X 坐标
   * @param y - 相对于容器的 Y 坐标
   */
  updateMousePosition(x: number, y: number): void {
    if (!this.mouseTrackingEnabled || !this.model || !this.pixiApp) {
      return
    }

    // 将坐标归一化到 -1 ~ 1
    const renderer = this.pixiApp.renderer
    const normalizedX = (x / renderer.width) * 2 - 1
    const normalizedY = (y / renderer.height) * 2 - 1

    // 通过 focus 方法控制视线方向
    const modelRecord = this.model as unknown as Record<string, unknown>
    const focusFn = modelRecord.focus
    if (typeof focusFn === 'function') {
      ;(focusFn as (x: number, y: number) => void).call(this.model, normalizedX, -normalizedY)
    }
  }

  /**
   * 调整画布尺寸
   * @param width - 新宽度
   * @param height - 新高度
   */
  resize(width: number, height: number): void {
    if (!this.pixiApp) return
    this.pixiApp.renderer.resize(width, height)

    // 重新居中模型
    if (this.model) {
      this.model.x = width / 2
      this.model.y = height / 2
    }
  }

  /** 销毁并释放所有资源 */
  destroy(): void {
    if (this.model) {
      this.model.destroy()
      this.model = null
    }

    if (this.pixiApp) {
      this.pixiApp.destroy(true, { children: true })
      this.pixiApp = null
    }

    this.mouseTrackingEnabled = false
    this.updateStatus('idle' as Live2DStatus)
  }

  /** 获取当前状态 */
  getStatus(): Live2DStatus {
    return this.status
  }

  /** 获取可用表情列表 */
  getExpressions(): string[] {
    if (!this.model?.internalModel?.motionManager?.expressionManager?.expressions) {
      return []
    }

    const expressions = this.model.internalModel.motionManager.expressionManager.expressions
    return expressions
      .map((e) => e.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
  }

  /** 获取可用动作组列表 */
  getMotionGroups(): string[] {
    return ['Idle', 'TapBody', 'TapHead']
  }
}
