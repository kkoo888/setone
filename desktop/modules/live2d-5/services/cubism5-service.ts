/**
 * Live2D Cubism 5 渲染服务（重构版）
 *
 * 基于 CubismUserModel 继承架构，使用 SDK 标准加载链路。
 * 所有效果（物理、眨眼、呼吸、注视、Pose、LipSync）由 UpdateScheduler 统一调度。
 *
 * @see AppModel (./AppModel.ts)
 */

import { AppModel } from './AppModel'
import { TouchManager } from './TouchManager'
import type { Cubism5ModelState, Cubism5ModelConfig, StateCallback, MotionGroup } from '../types'
// 静态导入 CubismFramework（Vite 警告修复）
import { CubismFramework } from '../lib/live2dcubismframework'

// ============ 常量 ============

const DEFAULT_MODEL_SCALE = 0.6
const CUBISM_CORE_SDK_PATH = './lib/live2dcubismcore5.min.js'

// ============ Cubism 5 Core 全局声明 ============

interface WindowWithCubism extends Window {
  Live2DCubismCore?: object
}

// ============ Cubism 5 Service 单例 ============

class Cubism5Service {
  private state: Cubism5ModelState = 'idle'
  private onStateChange: StateCallback | null = null
  private sdkLoaded = false
  private animFrameId: number | null = null

  // 多模型管理
  private _models: Map<string, AppModel> = new Map()
  private _activeModelName: string | null = null

  // 当前活跃模型的便捷访问
  private get model(): AppModel | null {
    return this._activeModelName ? (this._models.get(this._activeModelName) ?? null) : null
  }

  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  private canvas: HTMLCanvasElement | null = null

  // ★ 新增：手势管理器（与 Demo TouchManager 一致）
  private _touchManager: TouchManager = new TouchManager()

  // WebGL 上下文丢失标志
  private contextLost = false

  // ★ 新增：销毁标志，防止 destroy 后执行恢复逻辑
  private destroyed = false

  // ★ 新增：上下文事件处理器引用（用于 destroy 时移除）
  private _contextLostHandler: ((e: Event) => void) | null = null
  private _contextRestoredHandler: (() => void) | null = null

  // ★ 新增：ResizeObserver（用于监听 canvas 尺寸变化，替代每帧检查）
  private _resizeObserver: ResizeObserver | null = null

  // 时间追踪
  private lastUpdateTime = 0

  // 缓存
  private _modelPath = ''
  private _modelScale = DEFAULT_MODEL_SCALE

  // ★ 新增：模型切换锁，防止快速切换导致竞态
  private _switching = false

  // ★ 新增：帧率限制
  private _targetFPS: number = 60  // 默认 60 FPS
  private _lastFrameTime: number = 0

  setStateCallback(cb: StateCallback | null): void {
    this.onStateChange = cb
  }

  getState(): Cubism5ModelState {
    return this.state
  }

  getExpressions(): string[] {
    return this.model?.expressionNames ?? []
  }

  getMotions(): MotionGroup[] {
    return this.model?.motionGroups ?? []
  }

  /**
   * 加载 Cubism 5 Core SDK
   */
  async loadSDK(): Promise<void> {
    if (this.sdkLoaded) {
      console.log('[Cubism5] ⏭️ SDK 已加载, 跳过')
      return
    }

    console.log('[Cubism5] 🔄 开始加载 SDK...')
    this.updateState('loading')

    try {
      const win = window as WindowWithCubism
      if (win.Live2DCubismCore && (win.Live2DCubismCore as Record<string, unknown>).Memory) {
        console.log('[Cubism5] Core SDK 已存在 (Cubism 5)')
        this.sdkLoaded = true
        this.updateState('idle')
        return
      }

      if (win.Live2DCubismCore && !(win.Live2DCubismCore as Record<string, unknown>).Memory) {
        console.log('[Cubism5] ⚠️ 检测到 Cubism 4 SDK，需要加载 Cubism 5 SDK 覆盖')
      }

      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = CUBISM_CORE_SDK_PATH
        script.onload = () => {
          this.sdkLoaded = true
          resolve()
        }
        script.onerror = () => {
          reject(new Error('Cubism 5 Core SDK 加载失败'))
        }
        document.head.appendChild(script)
      })

      this.updateState('idle')
    } catch (err) {
      console.error('[Cubism5] ❌ SDK 加载失败:', err)
      this.updateState('error')
      throw err
    }
  }

  /**
   * 初始化 Cubism Framework（静态导入，直接调用）
   */
  private initFramework(): void {
    console.log('[Cubism5] 🔄 初始化 Cubism Framework...')
    if (CubismFramework.startUp) CubismFramework.startUp()
    if (CubismFramework.initialize) CubismFramework.initialize()
  }

  /**
   * 加载模型（使用 AppModel 标准流程）
   * ★ 关键修复：先获取 GL → 再 loadAssets(gl) → 纹理加载时 renderer.gl 已就绪
   */
  async loadModel(config: Cubism5ModelConfig, container: HTMLElement): Promise<void> {
    console.log('[Cubism5] 🚀 loadModel 开始, config:', JSON.stringify({ name: config.name, modelPath: config.modelPath, scale: config.scale }))

    if (!this.sdkLoaded) {
      await this.loadSDK()
    }

    this.updateState('loading')
    this._modelPath = config.modelPath
    this._modelScale = config.scale ?? DEFAULT_MODEL_SCALE
    this.destroyed = false  // ★ 重置销毁标志（支持重新加载）

    try {
      // 初始化 Framework
      this.initFramework()

      // 获取或创建 canvas
      this.canvas = container.querySelector('canvas') as HTMLCanvasElement
      if (!this.canvas) {
        this.canvas = document.createElement('canvas')
        container.appendChild(this.canvas)  // ★ 先挂载到 DOM，确保布局计算
      }

      // ★ 修复：等待容器布局完成后再设置尺寸
      const cw = container.clientWidth || container.offsetWidth || 400
      const ch = container.clientHeight || container.offsetHeight || 500
      this.canvas.width = cw
      this.canvas.height = ch
      this.canvas.style.width = '100%'
      this.canvas.style.height = '100%'

      if (cw === 0 || ch === 0) {
        console.warn('[Cubism5] ⚠️ 容器尺寸为 0，canvas 可能无法渲染')
      }
      console.log(`[Cubism5] 📐 Canvas 尺寸: ${cw}x${ch}, 容器: ${container.tagName}.${container.className}`)

      // ★ 关键修复：先获取 GL 上下文
      // alpha: true → 透明背景（配合 transparent 窗口）
      // premultipliedAlpha: false → 避免颜色被预乘导致透明度异常
      const glOptions: WebGLContextAttributes = {
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
        preserveDrawingBuffer: false,
      }
      this.gl = this.canvas.getContext('webgl2', glOptions) || this.canvas.getContext('webgl', glOptions)
      if (!this.gl) {
        throw new Error('WebGL 不可用')
      }

      // ★ 新增：使用 ResizeObserver 监听 canvas 尺寸变化（替代每帧检查）
      this.setupResizeObserver()

      // 注册上下文丢失/恢复事件（canvas 已在 DOM 中）
      this.registerContextEvents()

      // 如果同名模型已存在，先销毁旧的
      if (this._models.has(config.name)) {
        const oldModel = this._models.get(config.name)!
        oldModel.releaseAll()
        this._models.delete(config.name)
      }

      // ★ 关键修复：将 GL 传给 loadAssets，确保 startUp(gl) 在 loadTextures 之前
      const appModel = new AppModel()
      await appModel.loadAssets(config.modelPath, this._modelScale, this.gl)

      // 存入模型管理 Map
      this._models.set(config.name, appModel)
      this._activeModelName = config.name

      // 重置时间
      this.lastUpdateTime = performance.now() / 1000

      this.updateState('loaded')
      console.log('[Cubism5] ✅ 模型加载完成:', config.name)
      console.log('[Cubism5] 📋 表情:', appModel.expressionNames)
      console.log('[Cubism5] 📋 动作组:', appModel.motionGroups)

      // 开始渲染循环
      this.startRenderLoop()
    } catch (err) {
      console.error('[Cubism5] ❌ 模型加载失败:', err)
      this.updateState('error')
      throw err
    }
  }

  /**
   * 切换活跃模型
   * ★ 修复：添加切换锁防止快速切换导致竞态
   */
  switchModel(name: string): boolean {
    if (this._switching) {
      console.warn('[Cubism5] 模型切换中，请稍后再试')
      return false
    }
    
    if (!this._models.has(name)) {
      console.warn(`[Cubism5] 模型 "${name}" 未找到`)
      return false
    }

    this._switching = true
    try {
      this._activeModelName = name
      const appModel = this._models.get(name)!
      if (this.gl) {
        const renderer = appModel.getRenderer()
        if (renderer) {
          renderer.startUp(this.gl)
        }
      }
      console.debug(`[Cubism5] ✅ 切换到模型: ${name}`)
      return true
    } finally {
      this._switching = false
    }
  }

  /**
   * 卸载指定模型并释放 GPU 资源
   * 切换模型后调用此方法可释放不需要的模型内存
   */
  unloadModel(name: string): boolean {
    const appModel = this._models.get(name)
    if (!appModel) {
      console.warn(`[Cubism5] 模型 "${name}" 未找到，无法卸载`)
      return false
    }

    // 不能卸载当前活跃模型，需要先切换到其他模型
    if (this._activeModelName === name) {
      console.warn(`[Cubism5] 不能卸载当前活跃模型 "${name}"，请先切换到其他模型`)
      return false
    }

    appModel.releaseAll()
    this._models.delete(name)
    console.log(`[Cubism5] ✅ 模型 "${name}" 已卸载，剩余模型: ${this._models.size}`)
    return true
  }

  /**
   * 获取已加载模型列表（名称 + 是否活跃）
   */
  getLoadedModels(): Array<{ name: string; active: boolean; expressions: string[]; motionGroups: string[] }> {
    const result: Array<{ name: string; active: boolean; expressions: string[]; motionGroups: string[] }> = []
    for (const [name, appModel] of this._models) {
      result.push({
        name,
        active: name === this._activeModelName,
        expressions: appModel.expressionNames,
        motionGroups: appModel.motionGroups.map(g => g.group),
      })
    }
    return result
  }

  /**
   * 获取当前活跃模型名称
   */
  getActiveModelName(): string | null {
    return this._activeModelName
  }

  /**
   * ★ 新增：设置 ResizeObserver 监听 canvas 尺寸变化
   * 替代每帧检查 canvas.clientWidth，减少 reflow
   */
  private setupResizeObserver(): void {
    if (!this.canvas || !this.gl) return

    // 清理旧的 observer
    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
      this._resizeObserver = null
    }

    this._resizeObserver = new ResizeObserver((entries) => {
      if (this.destroyed || !this.canvas || !this.gl) return
      
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const newWidth = Math.floor(width)
        const newHeight = Math.floor(height)
        
        if (newWidth > 0 && newHeight > 0 && 
            (this.canvas.width !== newWidth || this.canvas.height !== newHeight)) {
          this.canvas.width = newWidth
          this.canvas.height = newHeight
          this.gl.viewport(0, 0, newWidth, newHeight)
        }
      }
    })

    this._resizeObserver.observe(this.canvas)
  }

  /**
   * 注册 WebGL 上下文丢失/恢复事件
   */
  private registerContextEvents(): void {
    if (!this.canvas) return

    // 先移除旧监听器（防止重复注册）
    if (this._contextLostHandler) {
      this.canvas.removeEventListener('webglcontextlost', this._contextLostHandler)
    }
    if (this._contextRestoredHandler) {
      this.canvas.removeEventListener('webglcontextrestored', this._contextRestoredHandler)
    }

    this._contextLostHandler = (e: Event) => {
      e.preventDefault()
      if (this.destroyed) return
      console.warn('[Cubism5] ⚠️ WebGL 上下文丢失')
      this.contextLost = true
      if (this.animFrameId !== null) {
        cancelAnimationFrame(this.animFrameId)
        this.animFrameId = null
      }
    }

    this._contextRestoredHandler = () => {
      if (this.destroyed) return
      console.log('[Cubism5] ✅ WebGL 上下文恢复')
      this.contextLost = false
      this.recoverFromContextLost()
    }

    this.canvas.addEventListener('webglcontextlost', this._contextLostHandler)
    this.canvas.addEventListener('webglcontextrestored', this._contextRestoredHandler)
  }

  /**
   * 从 WebGL 上下文丢失中恢复
   * ★ 修复：使用 reloadRenderer 重建渲染器（与 Demo 一致）
   * ★ 增强：验证上下文真正可用后再恢复，防止 null gl 导致 bindTexture 失败
   */
  private async recoverFromContextLost(): Promise<void> {
    if (!this.canvas || !this.model) return

    try {
      // 尝试从当前 canvas 获取上下文
      let gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl')

      // 如果上下文仍然处于 lost 状态，等待浏览器恢复
      if (!gl || gl.isContextLost()) {
        console.log('[Cubism5] ⏳ 等待 WebGL 上下文恢复...')
        gl = await new Promise<WebGLRenderingContext | WebGL2RenderingContext>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('等待上下文恢复超时')), 5000)
          const onRestored = () => {
            clearTimeout(timeout)
            this.canvas?.removeEventListener('webglcontextrestored', onRestored)
            const newGl = this.canvas?.getContext('webgl2') || this.canvas?.getContext('webgl')
            if (newGl && !newGl.isContextLost()) {
              resolve(newGl)
            } else {
              reject(new Error('上下文恢复后仍不可用'))
            }
          }
          this.canvas?.addEventListener('webglcontextrestored', onRestored)
        })
      }

      this.gl = gl
      this.contextLost = false
      await this.model.reloadRenderer(this.gl)

      this.lastUpdateTime = performance.now() / 1000
      this.startRenderLoop()
      console.log('[Cubism5] ✅ 从上下文丢失中恢复完成')
    } catch (err) {
      console.error('[Cubism5] ❌ 恢复失败:', err)
      this.updateState('error')
    }
  }

  /**
   * 开始渲染循环
   * ★ 新增：支持帧率限制
   */
  private startRenderLoop(): void {
    if (this.animFrameId !== null || this.destroyed) return

    this._lastFrameTime = performance.now()
    console.log('[Cubism5] 🎬 渲染循环启动')

    const render = (currentTime: number) => {
      // 帧率限制逻辑
      if (this._targetFPS > 0) {
        const frameInterval = 1000 / this._targetFPS
        const elapsed = currentTime - this._lastFrameTime

        if (elapsed < frameInterval) {
          // 还没到下一帧时间，跳过渲染
          this.animFrameId = requestAnimationFrame(render)
          return
        }

        // 更新上一帧时间（补偿超出的时间）
        this._lastFrameTime = currentTime - (elapsed % frameInterval)
      }

      this.renderFrame()
      this.animFrameId = requestAnimationFrame(render)
    }
    this.animFrameId = requestAnimationFrame(render)
  }

  /**
   * ★ 新增：设置目标帧率
   * @param fps 目标帧率（0 = 无限制）
   */
  setTargetFPS(fps: number): void {
    this._targetFPS = Math.max(0, fps)
    console.debug(`[Cubism5] 🎯 目标帧率: ${fps === 0 ? '无限制' : fps + ' FPS'}`)
  }

  /**
   * ★ 新增：获取当前目标帧率
   */
  getTargetFPS(): number {
    return this._targetFPS
  }

  /**
   * 渲染一帧
   * ★ 修复：canvas 尺寸更新已移至 ResizeObserver，此处不再每帧检查
   */
  private renderFrame(): void {
    if (!this.gl || !this.model || !this.canvas || this.contextLost || this.destroyed) return

    const gl = this.gl
    const canvas = this.canvas

    // 清除画布
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // 计算 deltaTime（★ 保护：钳制到合理范围，防止负值或过大跳帧）
    const now = performance.now() / 1000
    let deltaTime = now - this.lastUpdateTime
    this.lastUpdateTime = now
    if (deltaTime < 0) deltaTime = 0
    if (deltaTime > 0.5) deltaTime = 0.5  // 最大 500ms，防止跳帧

    // 通过 AppModel.updateModel 统一调度所有效果
    this.model.updateModel(deltaTime)

    // 创建 MVP 矩阵并渲染
    const mvp = this.createMvpMatrix(canvas.width, canvas.height)
    this.model.render(gl, mvp)
  }

  /**
   * 创建 MVP 矩阵（正交投影 × 模型矩阵，居中显示）
   */
  private createMvpMatrix(width: number, height: number): { getArray(): Float32Array } {
    const matrix = this.model?.getModelMatrix()
    if (!matrix) {
      // fallback：居中的正交投影
      const projection = new Float32Array(16)
      projection[0] = 2 / width
      projection[5] = -2 / height
      projection[10] = 1
      projection[12] = -1
      projection[13] = 1
      projection[15] = 1
      return { getArray: () => projection }
    }

    const mvpArr = new Float32Array(matrix.getArray())
    const sx = 2 / width
    const sy = -2 / height
    for (let col = 0; col < 4; col++) {
      mvpArr[0 * 4 + col] *= sx
      mvpArr[1 * 4 + col] *= sy
    }

    // ★ 居中偏移：将模型移到 canvas 中心
    // 模型矩阵的平移分量在 [12] (tx) 和 [13] (ty)
    // 通过调整偏移使模型居中
    mvpArr[12] += 0  // X 方向由模型矩阵 Layout 控制
    mvpArr[13] += 0  // Y 方向由模型矩阵 Layout 控制

    return { getArray: () => mvpArr }
  }

  /**
   * 切换表情（操作当前活跃模型）
   */
  async setExpression(expressionId: string): Promise<void> {
    if (!this.model) {
      console.warn('[Cubism5] 模型未加载')
      return
    }
    this.model.playExpression(expressionId)
    console.log(`[Cubism5] ✅ 切换表情: ${expressionId}`)
  }

  /**
   * 播放动作（操作当前活跃模型）
   */
  async playMotion(motionId: string): Promise<void> {
    if (!this.model) {
      console.warn('[Cubism5] 模型未加载')
      return
    }
    this.model.playMotion(motionId)
    console.log(`[Cubism5] ✅ 播放动作: ${motionId}`)
  }

  /**
   * ★ 新增：触摸/按下开始（与 Demo LAppView.onTouchesBegan 一致）
   */
  onTouchesBegan(deviceX: number, deviceY: number): void {
    const dpr = window.devicePixelRatio || 1
    this._touchManager.touchesBegan(deviceX * dpr, deviceY * dpr)
  }

  /**
   * ★ 新增：触摸/拖拽移动（与 Demo LAppView.onTouchesMoved 一致）
   */
  onTouchesMoved(deviceX: number, deviceY: number): void {
    if (!this.model) return
    const dpr = window.devicePixelRatio || 1
    const posX = deviceX * dpr
    const posY = deviceY * dpr

    const viewX = this.model.transformViewX(this._touchManager.getX())
    const viewY = this.model.transformViewY(this._touchManager.getY())

    this._touchManager.touchesMoved(posX, posY)

    this.model.setDragging(viewX, viewY)
  }

  /**
   * ★ 新增：触摸/抬起结束（与 Demo LAppView.onTouchesEnded 一致）
   */
  onTouchesEnded(deviceX: number, deviceY: number): void {
    if (!this.model) return
    const dpr = window.devicePixelRatio || 1
    const posX = deviceX * dpr
    const posY = deviceY * dpr

    // 清除拖拽
    this.model.setDragging(0.0, 0.0)

    // 坐标转换后触发点击
    const viewX = this.model.transformViewX(posX)
    const viewY = this.model.transformViewY(posY)
    this.model.onTap(viewX, viewY)
  }

  /**
   * 点击事件（设备坐标 → HiDPI 适配 → 逻辑坐标 → hitTest）
   * 保留兼容接口
   */
  onTap(deviceX: number, deviceY: number): void {
    if (!this.model) return
    const dpr = window.devicePixelRatio || 1
    const logicalX = this.model.transformViewX(deviceX * dpr)
    const logicalY = this.model.transformViewY(deviceY * dpr)
    this.model.onTap(logicalX, logicalY)
  }

  /**
   * 命中检测（设备坐标 → HiDPI 适配 → 逻辑坐标 → hitTest）
   */
  hitTest(hitAreaName: string, deviceX: number, deviceY: number): boolean {
    if (!this.model) return false
    const dpr = window.devicePixelRatio || 1
    const logicalX = this.model.transformViewX(deviceX * dpr)
    const logicalY = this.model.transformViewY(deviceY * dpr)
    return this.model.hitTest(hitAreaName, logicalX, logicalY)
  }

  /**
   * 设置拖拽（设备坐标 → HiDPI 适配 → 归一化 → setDragging）
   * 保留兼容接口，推荐使用 onTouchesBegan/Moved/Ended
   */
  setDragging(deviceX: number, deviceY: number): void {
    if (!this.model || !this.canvas) return
    const dpr = window.devicePixelRatio || 1
    const viewX = this.model.transformViewX(deviceX * dpr)
    const viewY = this.model.transformViewY(deviceY * dpr)
    const canvasW = this.canvas.clientWidth
    const canvasH = this.canvas.clientHeight
    const ratio = canvasW / canvasH
    const normX = viewX / ratio
    const normY = viewY
    this.model.setDragging(normX, normY)
  }

  /**
   * 获取实时状态（供管理页面刷新按钮使用）
   */
  getLiveStatus(): {
    sdkLoaded: boolean
    contextLost: boolean
    mouseTracking: boolean
    clickInteraction: boolean
    currentExpression: string
    currentMotion: string
    lipSyncActive: boolean
    bubbleText: string
  } {
    return {
      sdkLoaded: this.sdkLoaded,
      contextLost: this.contextLost,
      mouseTracking: this.model != null,
      clickInteraction: this.model != null,
      currentExpression: this.model?.getCurrentExpression?.() ?? '默认',
      currentMotion: this.model?.getCurrentMotion?.() ?? '默认',
      lipSyncActive: false,
      bubbleText: '无',
    }
  }

  /**
   * 截取当前 canvas 为 base64 图片（供管理页面预览）
   */
  getPreviewImage(): string | null {
    if (!this.canvas) return null
    try {
      return this.canvas.toDataURL('image/png')
    } catch {
      return null
    }
  }

  /**
   * ★ 新增：获取动作队列状态（供管理页面显示）
   */
  getMotionQueueStatus(): { isFinished: boolean; queueLength: number; currentPriority: number } | null {
    if (!this.model) return null
    return this.model.getMotionQueueStatus()
  }

  /**
   * ★ 新增：切换到麦克风输入（实时 LipSync）
   */
  async switchToMicrophone(): Promise<boolean> {
    if (!this.model) return false
    return await this.model.switchToMicrophone()
  }

  /**
   * ★ 新增：切换到 WAV 文件输入
   */
  switchToWavFile(filePath: string): void {
    if (!this.model) return
    this.model.switchToWavFile(filePath)
  }

  /**
   * ★ 新增：停止所有音频输入
   */
  stopAudio(): void {
    if (!this.model) return
    this.model.stopAudio()
  }

  /**
   * ★ 新增：获取当前音频输入类型
   */
  getAudioInputType(): 'microphone' | 'wav' | 'none' {
    if (!this.model) return 'none'
    return this.model.getAudioInputType()
  }

  /**
   * 重新加载当前模型（用于模型异常时手动恢复）
   */
  async reloadModel(): Promise<boolean> {
    if (!this._activeModelName || !this._modelPath) {
      console.warn('[Cubism5] 无活跃模型，无法重新加载')
      return false
    }
    const name = this._activeModelName
    const path = this._modelPath
    const scale = this._modelScale

    // 停止渲染循环
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    // 销毁旧模型（releaseAll 会把 renderer.gl 设为 null）
    const oldModel = this._models.get(name)
    if (oldModel) {
      oldModel.releaseAll()
      this._models.delete(name)
    }
    this._activeModelName = null

    try {
      this.updateState('loading')
      this.initFramework()

      // ★ 关键修复：重建 GL 上下文
      // 注意：不能调用 loseContext() 后立即 getContext()，因为 getContext() 会返回
      // 同一个处于 lost 状态的上下文对象，导致后续 bindTexture 等操作失败（null 引用）
      if (this.canvas) {
        const existingCtx = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl')

        if (existingCtx && !existingCtx.isContextLost()) {
          // 上下文仍然可用，直接复用
          this.gl = existingCtx
        } else {
          // 上下文已丢失，需要通过替换 canvas 元素来获取全新的上下文
          const oldCanvas = this.canvas
          const parent = oldCanvas.parentElement
          const newCanvas = document.createElement('canvas')
          newCanvas.width = oldCanvas.width
          newCanvas.height = oldCanvas.height
          newCanvas.style.cssText = oldCanvas.style.cssText
          newCanvas.className = oldCanvas.className

          if (parent) {
            parent.replaceChild(newCanvas, oldCanvas)
          }
          this.canvas = newCanvas
          this.gl = newCanvas.getContext('webgl2') || newCanvas.getContext('webgl')

          // 鼠标事件由宠物窗口层绑定，canvas 替换后不影响
        }

        // 重新注册上下文事件
        this.registerContextEvents()
      }
      if (!this.gl) {
        throw new Error('WebGL 上下文不可用，无法重新加载模型')
      }

      console.log('[Cubism5] 🔄 GL 上下文已重建，开始加载模型...')

      const appModel = new AppModel()
      await appModel.loadAssets(path, scale, this.gl)

      this._models.set(name, appModel)
      this._activeModelName = name
      this.lastUpdateTime = performance.now() / 1000

      this.updateState('loaded')
      this.startRenderLoop()
      console.log(`[Cubism5] ✅ 模型重新加载完成: ${name}`)
      return true
    } catch (err) {
      console.error('[Cubism5] ❌ 模型重新加载失败:', err)
      this.updateState('error')
      return false
    }
  }

  /**
   * 销毁 — 释放所有资源
   * ★ 修复：先设 destroyed 标志，防止 loseContext 触发恢复逻辑
   */
  destroy(): void {
    this.destroyed = true  // ★ 最先设置，防止后续任何恢复/渲染操作

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    // ★ 新增：清理 ResizeObserver
    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
      this._resizeObserver = null
    }

    for (const [, appModel] of this._models) {
      appModel.releaseAll()
    }
    this._models.clear()
    this._activeModelName = null

    if (this.gl) {
      try {
        const ext = this.gl.getExtension('WEBGL_lose_context')
        ext?.loseContext()
      } catch { /* ignore */ }
      this.gl = null
    }

    if (this.canvas) {
      // ★ 移除上下文事件监听器
      if (this._contextLostHandler) {
        this.canvas.removeEventListener('webglcontextlost', this._contextLostHandler)
        this._contextLostHandler = null
      }
      if (this._contextRestoredHandler) {
        this.canvas.removeEventListener('webglcontextrestored', this._contextRestoredHandler)
        this._contextRestoredHandler = null
      }
      if (this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas)
      }
    }
    this.canvas = null

    this.sdkLoaded = false
    this.contextLost = false
    this.lastUpdateTime = 0
    this._modelPath = ''
    this.updateState('idle')
  }

  private updateState(newState: Cubism5ModelState): void {
    this.state = newState
    this.onStateChange?.(newState)
  }
}

// 单例导出
export const cubism5Service = new Cubism5Service()

// 暴露到 window，供主进程 executeJavaScript 调用
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__cubism5Service = cubism5Service
}
