/**
 * Live2D Cubism 5 渲染服务（重构版）
 *
 * 基于 CubismUserModel 继承架构，使用 SDK 标准加载链路。
 * 所有效果（物理、眨眼、呼吸、注视、Pose、LipSync）由 UpdateScheduler 统一调度。
 *
 * @see AppModel (./AppModel.ts)
 */

import { AppModel } from './AppModel'
import type { Cubism5ModelState, Cubism5ModelConfig, StateCallback, MotionGroup } from '../types'
// 静态导入 CubismFramework（Vite 警告修复）
import { CubismFramework } from '../lib/live2dcubismframework'

// ============ 常量 ============

const DEFAULT_MODEL_SCALE = 0.15
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

  // WebGL 上下文丢失标志
  private contextLost = false

  // 时间追踪
  private lastUpdateTime = 0

  // 缓存
  private _modelPath = ''
  private _modelScale = DEFAULT_MODEL_SCALE

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
   * ★ 关键修复：先获取 GL → 再 loadAssets(gl) → 纹理加载时 _gl 已就绪
   */
  async loadModel(config: Cubism5ModelConfig, container: HTMLElement): Promise<void> {
    console.log('[Cubism5] 🚀 loadModel 开始, config:', JSON.stringify({ name: config.name, modelPath: config.modelPath, scale: config.scale }))

    if (!this.sdkLoaded) {
      await this.loadSDK()
    }

    this.updateState('loading')
    this._modelPath = config.modelPath
    this._modelScale = config.scale ?? DEFAULT_MODEL_SCALE

    try {
      // 初始化 Framework
      this.initFramework()

      // 获取或创建 canvas
      this.canvas = container.querySelector('canvas') as HTMLCanvasElement
      if (!this.canvas) {
        this.canvas = document.createElement('canvas')
        this.canvas.width = container.clientWidth
        this.canvas.height = container.clientHeight
        container.appendChild(this.canvas)
      }

      // ★ 关键修复：先获取 GL 上下文
      this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl')
      if (!this.gl) {
        throw new Error('WebGL 不可用')
      }

      // 注册上下文丢失/恢复事件
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
   */
  switchModel(name: string): boolean {
    if (!this._models.has(name)) {
      console.warn(`[Cubism5] 模型 "${name}" 未找到`)
      return false
    }
    this._activeModelName = name
    const appModel = this._models.get(name)!
    if (this.gl) {
      const renderer = appModel.getRenderer()
      if (renderer) {
        renderer.startUp(this.gl)
      }
    }
    console.log(`[Cubism5] ✅ 切换到模型: ${name}`)
    return true
  }

  /**
   * 注册 WebGL 上下文丢失/恢复事件
   */
  private registerContextEvents(): void {
    if (!this.canvas) return

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      console.warn('[Cubism5] ⚠️ WebGL 上下文丢失')
      this.contextLost = true
      if (this.animFrameId !== null) {
        cancelAnimationFrame(this.animFrameId)
        this.animFrameId = null
      }
    })

    this.canvas.addEventListener('webglcontextrestored', () => {
      console.log('[Cubism5] ✅ WebGL 上下文恢复')
      this.contextLost = false
      this.recoverFromContextLost()
    })
  }

  /**
   * 从 WebGL 上下文丢失中恢复
   * ★ 修复：使用 reloadRenderer 重建渲染器（与 Demo 一致）
   */
  private async recoverFromContextLost(): Promise<void> {
    if (!this.canvas || !this.model) return

    try {
      this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl')
      if (!this.gl) {
        console.error('[Cubism5] ❌ 恢复 WebGL 上下文失败')
        this.updateState('error')
        return
      }

      // ★ 修复：使用 reloadRenderer 重建渲染器 + 重新绑定纹理
      this.model.reloadRenderer(this.gl)

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
   */
  private startRenderLoop(): void {
    if (this.animFrameId !== null) return

    const render = () => {
      this.renderFrame()
      this.animFrameId = requestAnimationFrame(render)
    }
    this.animFrameId = requestAnimationFrame(render)
  }

  /**
   * 渲染一帧
   */
  private renderFrame(): void {
    if (!this.gl || !this.model || !this.canvas || this.contextLost) return

    const gl = this.gl
    const canvas = this.canvas

    // 更新 canvas 尺寸
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth
      canvas.height = canvas.clientHeight
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    // 清除画布
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // 计算 deltaTime
    const now = performance.now() / 1000
    const deltaTime = now - this.lastUpdateTime
    this.lastUpdateTime = now

    // 通过 AppModel.updateModel 统一调度所有效果
    this.model.updateModel(deltaTime)

    // 创建 MVP 矩阵并渲染
    const mvp = this.createMvpMatrix(canvas.width, canvas.height)
    this.model.render(gl, mvp)
  }

  /**
   * 创建 MVP 矩阵（正交投影 × 模型矩阵）
   */
  private createMvpMatrix(width: number, height: number): { getArray(): Float32Array } {
    const matrix = this.model?.getModelMatrix()
    if (!matrix) {
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
   * ★ 修复：点击事件（设备坐标 → HiDPI 适配 → 逻辑坐标 → hitTest）
   * 与 Demo LAppView.onTouchesEnded 一致：乘以 devicePixelRatio
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
   * 与 Demo LAppView.onTouchesMoved 一致
   */
  setDragging(deviceX: number, deviceY: number): void {
    if (!this.model || !this.canvas) return
    const dpr = window.devicePixelRatio || 1
    const viewX = this.model.transformViewX(deviceX * dpr)
    const viewY = this.model.transformViewY(deviceY * dpr)
    // 归一化到 -1 ~ 1
    const canvasW = this.canvas.clientWidth
    const canvasH = this.canvas.clientHeight
    const ratio = canvasW / canvasH
    const normX = viewX / ratio
    const normY = viewY
    this.model.setDragging(normX, normY)
  }

  /**
   * 销毁 — 释放所有资源
   */
  destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
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

    if (this.canvas?.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas)
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
