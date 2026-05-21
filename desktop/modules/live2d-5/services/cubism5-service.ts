/**
 * Live2D Cubism 5 渲染服务（重构版）
 *
 * 基于 CubismUserModel 继承架构，使用 SDK 标准加载链路。
 * 所有效果（物理、眨眼、呼吸、注视、Pose、LipSync）由 UpdateScheduler 统一调度。
 *
 * 对外接口保持不变，Live2D5PetPage 无需改动。
 *
 * @see AppModel (./AppModel.ts)
 */

import { AppModel } from './AppModel'
import type { Cubism5ModelState, Cubism5ModelConfig, StateCallback, MotionGroup } from '../types'

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

  // 核心对象
  private model: AppModel | null = null
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  private canvas: HTMLCanvasElement | null = null

  // WebGL 上下文丢失标志
  private contextLost = false

  // 时间追踪
  private lastUpdateTime = 0

  // 缓存的 modelPath（用于 context 恢复）
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
   * 初始化 Cubism 5 Framework
   */
  private async initFramework(): Promise<void> {
    console.log('[Cubism5] 🔄 初始化 Cubism Framework...')
    const frameworkModule = await import('../lib/live2dcubismframework')
    const CubismFramework = frameworkModule.CubismFramework ?? frameworkModule.default

    if (CubismFramework.startUp) CubismFramework.startUp()
    if (CubismFramework.initialize) CubismFramework.initialize()
  }

  /**
   * 加载模型（使用 AppModel 标准流程）
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
      await this.initFramework()

      // 获取或创建 canvas
      this.canvas = container.querySelector('canvas') as HTMLCanvasElement
      if (!this.canvas) {
        this.canvas = document.createElement('canvas')
        this.canvas.width = container.clientWidth
        this.canvas.height = container.clientHeight
        container.appendChild(this.canvas)
      }

      // 获取 WebGL 上下文
      this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl')
      if (!this.gl) {
        throw new Error('WebGL 不可用')
      }

      // 注册上下文丢失/恢复事件
      this.registerContextEvents()

      // 创建 AppModel 并加载所有资源
      this.model = new AppModel()
      await this.model.loadAssets(config.modelPath, this._modelScale)

      // 渲染器需要 GL 上下文 — 调用 startUp
      const renderer = this.model.getRenderer()
      if (renderer) {
        renderer.startUp(this.gl)
        renderer.setIsPremultipliedAlpha(true)
      }

      // 重置时间
      this.lastUpdateTime = performance.now() / 1000

      this.updateState('loaded')
      console.log('[Cubism5] ✅ 模型加载完成:', config.name)
      console.log('[Cubism5] 📋 表情:', this.model.expressionNames)
      console.log('[Cubism5] 📋 动作组:', this.model.motionGroups)

      // 开始渲染循环
      this.startRenderLoop()
    } catch (err) {
      console.error('[Cubism5] ❌ 模型加载失败:', err)
      this.updateState('error')
      throw err
    }
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

      // 重新启动渲染器
      const renderer = this.model.getRenderer()
      if (renderer) {
        renderer.startUp(this.gl)
      }

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
      // fallback
      const projection = new Float32Array(16)
      projection[0] = 2 / width
      projection[5] = -2 / height
      projection[10] = 1
      projection[12] = -1
      projection[13] = 1
      projection[15] = 1
      return { getArray: () => projection }
    }

    // 复制模型矩阵
    const mvpArr = new Float32Array(matrix.getArray())

    // 叠加正交投影
    const sx = 2 / width
    const sy = -2 / height
    for (let col = 0; col < 4; col++) {
      mvpArr[0 * 4 + col] *= sx
      mvpArr[1 * 4 + col] *= sy
    }

    return { getArray: () => mvpArr }
  }

  /**
   * 切换表情
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
   * 播放动作
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
   * 销毁 — 释放所有资源
   */
  destroy(): void {
    // 停止渲染循环
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    // 释放模型
    if (this.model) {
      this.model.releaseAll()
      this.model = null
    }

    // 释放 WebGL 上下文
    if (this.gl) {
      try {
        const ext = this.gl.getExtension('WEBGL_lose_context')
        ext?.loseContext()
      } catch { /* ignore */ }
      this.gl = null
    }

    // 清理 canvas
    if (this.canvas?.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas)
    }
    this.canvas = null

    // 重置状态
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
