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
import { CubismMatrix44 } from '../lib/math/cubismmatrix44'
import { CubismShaderManager_WebGL } from '../lib/rendering/cubismshader_webgl'

// ============ 常量 ============

const DEFAULT_MODEL_SCALE = 0.85
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

  // ★ 新增：shader 就绪回调（供 UI 层监听）
  private _onShaderReady: (() => void) | null = null

  // ★ 新增：模型切换锁，防止快速切换导致竞态
  private _switching = false

  // 帧率限制
  private _targetFPS: number = 60  // 默认 60 FPS
  private _lastFrameTime: number = 0

  // ★ 新增：shader 就绪通知标志（防止重复触发）
  private _shaderReadyNotified: boolean = false
  // ★ 新增：渲染验证标志（首帧验证用）
  private _renderVerified: boolean = false
  // ★ 新增：测试三角形已绘制标志
  private _testTriangleDrawn: boolean = false

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
   * 获取动作组名称列表（供日志/UI 显示，避免 [object Object]）
   */
  getMotionGroupNames(): string[] {
    return (this.model?.motionGroups ?? []).map(g => g.group)
  }

  /**
   * 设置 shader 就绪回调（UI 层用于隐藏 loading）
   */
  setOnShaderReady(cb: (() => void) | null): void {
    this._onShaderReady = cb
  }

  /**
   * 查询 shader 是否已加载完成
   */
  isShaderLoaded(): boolean {
    if (!this.gl) return false
    try {
      const shader = CubismShaderManager_WebGL.getInstance().getShader(this.gl)
      return shader?._isShaderLoaded ?? false
    } catch {
      return false
    }
  }

  /**
   * 等待 shader 加载完成（返回 Promise，UI 层可 await）
   */
  waitForShaderReady(timeoutMs = 15000): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isShaderLoaded()) { resolve(true); return }

      const start = Date.now()
      const poll = () => {
        if (this.destroyed) { resolve(false); return }
        if (this.isShaderLoaded()) {
          this._onShaderReady?.()
          resolve(true)
          return
        }
        if (Date.now() - start > timeoutMs) {
          console.warn('[Cubism5] ⏰ 等待 shader 超时')
          resolve(false)
          return
        }
        requestAnimationFrame(poll)
      }
      requestAnimationFrame(poll)
    })
  }

  /**
   * 加载 Cubism 5 Core SDK
   */
  async loadSDK(): Promise<void> {
    if (this.sdkLoaded) {
      console.debug('[Cubism5] ⏭️ SDK 已加载, 跳过')
      return
    }

    console.debug('[Cubism5] 🔄 开始加载 SDK...')
    this.updateState('loading')

    try {
      const win = window as WindowWithCubism
      if (win.Live2DCubismCore && (win.Live2DCubismCore as Record<string, unknown>).Memory) {
        console.debug('[Cubism5] Core SDK 已存在 (Cubism 5)')
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
    console.debug('[Cubism5] 🔄 初始化 Cubism Framework...')
    if (CubismFramework.startUp) CubismFramework.startUp()
    if (CubismFramework.initialize) CubismFramework.initialize()
  }

  /**
   * 加载模型（使用 AppModel 标准流程）
   * ★ 关键修复：先获取 GL → 再 loadAssets(gl) → 纹理加载时 renderer.gl 已就绪
   */
  async loadModel(config: Cubism5ModelConfig, container: HTMLElement): Promise<void> {
    console.debug('[Cubism5] 🚀 loadModel 开始, config:', JSON.stringify({ name: config.name, modelPath: config.modelPath, scale: config.scale }))

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
      console.debug(`[Cubism5] 📐 Canvas 尺寸: ${cw}x${ch}, 容器: ${container.tagName}.${container.className}`)

      // ★ 关键修复：先获取 GL 上下文
      // alpha: true → 透明背景（配合 transparent 窗口）
      // ★ 修复：premultipliedAlpha 改为 true，与 Cubism SDK 的 setIsPremulipliedAlpha(true) 保持一致
      // 否则 SDK shader 用预乘方式处理 alpha，但 WebGL 输出非预乘，导致模型全透明不可见
      const glOptions: WebGLContextAttributes = {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        preserveDrawingBuffer: true,  // ★ 改为 true，确保 readPixels 和截图可靠
      }
      this.gl = this.canvas.getContext('webgl2', glOptions) || this.canvas.getContext('webgl', glOptions)
      if (!this.gl) {
        throw new Error('WebGL 不可用')
      }

      // ★ 关键：设置 viewport（与官方 Demo LAppSubdelegate.resizeCanvas() 一致）
      // viewport 设置后持久生效，不需要每帧调用
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)

      // 使用 ResizeObserver 监听 canvas 尺寸变化
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

      // ★ 关键修复：设置 renderer 的 offscreen render target 尺寸为 canvas 实际像素尺寸
      // setupRenderer() 使用的是模型内部坐标（很小），导致 offscreen FBO 尺寸不匹配
      const renderer = appModel.getRenderer()
      console.log('[Cubism5] 🔍 renderer 存在:', !!renderer, 'canvas:', this.canvas?.width, 'x', this.canvas?.height)
      if (renderer) {
        const oldW = (renderer as any)._modelRenderTargetWidth ?? 'N/A'
        const oldH = (renderer as any)._modelRenderTargetHeight ?? 'N/A'
        const rtLen = renderer._modelRenderTargets?.length ?? 0
        const rt0W = renderer._modelRenderTargets?.[0]?.getBufferWidth?.() ?? 'N/A'
        const rt0H = renderer._modelRenderTargets?.[0]?.getBufferHeight?.() ?? 'N/A'
        console.log(`[Cubism5] 🔧 setRenderState 前: rendererTarget=${oldW}x${oldH}, rtCount=${rtLen}, rt0Size=${rt0W}x${rt0H}`)
        renderer.setRenderState(null, [0, 0, this.canvas.width, this.canvas.height])
        const newW = (renderer as any)._modelRenderTargetWidth
        const newH = (renderer as any)._modelRenderTargetHeight
        console.log(`[Cubism5] 🔧 setRenderState 后: rendererTarget=${newW}x${newH}, rt0Size 仍=${rt0W}x${rt0H} (下次渲染时重建)`)
      }

      // 存入模型管理 Map
      this._models.set(config.name, appModel)
      this._activeModelName = config.name

      // 重置时间
      this.lastUpdateTime = performance.now() / 1000
      this._shaderReadyNotified = false  // 重置 shader 就绪通知标志
      this._renderVerified = false  // 重置渲染验证标志
      this._testTriangleDrawn = false  // 重置测试三角形标志

      this.updateState('loaded')
      console.log('[Cubism5] ✅ 模型加载完成:', config.name)
      console.log('[Cubism5] 📋 表情:', appModel.expressionNames)
      console.log('[Cubism5] 📋 动作组:', appModel.motionGroups.map(g => g.group))

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

          // ★ 同步更新 renderer 的 offscreen render target 尺寸
          if (this.model) {
            const renderer = this.model.getRenderer()
            if (renderer) {
              renderer.setRenderState(null, [0, 0, newWidth, newHeight])
            }
          }
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
    console.debug('[Cubism5] 🎬 渲染循环启动')

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
   * 按 Cubism 5 官方渲染流程：clear → updateModel → createMvpMatrix → render
   * @see Cubism5渲染流程.md
   */
  private renderFrame(): void {
    if (!this.gl || !this.model || !this.canvas || this.contextLost || this.destroyed) {
      return
    }

    const gl = this.gl
    const canvas = this.canvas

    // ① 清除画布（官方流程第 1 步）
    gl.clearColor(0.0, 0.0, 0.0, 0.0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    // ★ 诊断：首帧打印关键状态
    if (!this._debugLogged) {
      this._debugLogged = true
      const renderer = this.model.getRenderer()
      const shader = renderer ? (renderer as any)._shaderManager ?? null : null
      const shaderLoaded = shader ? shader._isShaderLoaded : 'no shader manager'
      console.log('[Cubism5] 🔍 渲染诊断:', {
        canvasSize: `${canvas.width}x${canvas.height}`,
        glContext: gl ? `${gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1'}` : 'null',
        drawableCount: this.model.getModel()?.getDrawableCount?.() ?? 'unknown',
        shaderLoaded,
        rendererExists: !!renderer,
      })
    }

    // ★ 新增：shader 就绪后通知 UI 层（仅触发一次）
    // 在 model.render() 之后检查，确保 doDrawModel 已经真正执行过
    if (!this._shaderReadyNotified) {
      try {
        const shader = CubismShaderManager_WebGL.getInstance().getShader(this.gl)
        if (shader?._isShaderLoaded) {
          this._shaderReadyNotified = true
          this._onShaderReady?.()
        }
      } catch { /* ignore */ }
    }

    // ② 计算 deltaTime（钳制到合理范围，防止负值或过大跳帧）
    const now = performance.now() / 1000
    let deltaTime = now - this.lastUpdateTime
    this.lastUpdateTime = now
    if (deltaTime < 0) deltaTime = 0
    if (deltaTime > 0.5) deltaTime = 0.5

    // ③ 通过 AppModel.updateModel 统一调度所有效果（官方流程第 2 步）
    this.model.updateModel(deltaTime)

    // ④ 创建 MVP 矩阵并渲染（官方流程第 3-4 步）
    const mvp = this.createMvpMatrix(canvas.width, canvas.height)
    this.model.render(gl, mvp)

    // ★ 诊断：shader 就绪后，读取像素验证渲染是否生效（每帧检查直到成功）
    if (this._shaderReadyNotified && !this._renderVerified) {
      const pixels = new Uint8Array(4)
      gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

      // ★ 关键测试：绕过 Cubism copy shader，直接用简单 shader 把 FBO 纹理画到 canvas
      if (!this._testTriangleDrawn) {
        this._testTriangleDrawn = true
        const renderer = this.model.getRenderer()
        const rt0 = renderer?._modelRenderTargets?.[0]
        const fboTex = rt0?.getColorBuffer?.()

        if (fboTex) {
          // 读取 FBO 纹理像素（通过临时 FBO）
          const tempFbo = gl.createFramebuffer()
          gl.bindFramebuffer(gl.FRAMEBUFFER, tempFbo)
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0)
          const fboPixels = new Uint8Array(4)
          gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, fboPixels)
          console.log('[Cubism5] 🔍 FBO 纹理中心像素 RGBA:', Array.from(fboPixels),
            fboPixels[3] > 0 ? '(有内容!)' : '(透明)')
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.deleteFramebuffer(tempFbo)

          // 用最简单的 shader 把 FBO 纹理画到 canvas
          const vs = gl.createShader(gl.VERTEX_SHADER)!
          gl.shaderSource(vs, 'attribute vec2 a;varying vec2 v;void main(){gl_Position=vec4(a,0,1);v=(a+1.0)*0.5;}')
          gl.compileShader(vs)
          const fs = gl.createShader(gl.FRAGMENT_SHADER)!
          gl.shaderSource(fs, 'precision mediump float;varying vec2 v;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,v);}')
          gl.compileShader(fs)
          const prog = gl.createProgram()!
          gl.attachShader(prog, vs)
          gl.attachShader(prog, fs)
          gl.linkProgram(prog)
          gl.useProgram(prog)
          const buf = gl.createBuffer()
          gl.bindBuffer(gl.ARRAY_BUFFER, buf)
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)
          const loc = gl.getAttribLocation(prog, 'a')
          gl.enableVertexAttribArray(loc)
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, fboTex)
          gl.uniform1i(gl.getUniformLocation(prog, 't'), 0)
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.viewport(0, 0, canvas.width, canvas.height)
          gl.disable(gl.BLEND)
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

          // 读取结果
          const resultPixels = new Uint8Array(4)
          gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, resultPixels)
          console.log('[Cubism5] 🧪 简单 shader 复制 FBO → canvas 中心像素:', Array.from(resultPixels),
            resultPixels[3] > 0 ? '✅ FBO 有内容且可复制!' : '❌ FBO 内容为空或复制失败')

          gl.useProgram(null)
          gl.deleteProgram(prog)
          gl.deleteShader(vs)
          gl.deleteShader(fs)
          gl.deleteBuffer(buf)
        } else {
          console.warn('[Cubism5] ⚠️ FBO 纹理不存在!')
        }
      }

      if (pixels[3] > 0) {
        this._renderVerified = true
        console.log('[Cubism5] ✅ 渲染验证通过 — canvas 中心像素 RGBA:', Array.from(pixels))
      } else {
        const renderer = this.model.getRenderer()
        const model = this.model.getModel()
        const dc = model?.getDrawableCount?.() ?? 0
        let visibleCount = 0
        for (let i = 0; i < dc; i++) {
          if (model?.getDrawableDynamicFlagIsVisible?.(i)) visibleCount++
        }
        const rt = renderer?._modelRenderTargets
        const diag = {
          pixels: Array.from(pixels),
          canvasSize: `${canvas.width}x${canvas.height}`,
          rt0Size: `${rt?.[0]?.getBufferWidth?.()}x${rt?.[0]?.getBufferHeight?.()}`,
          rt0Valid: rt?.[0]?.isValid?.() ?? false,
          visibleCount,
          drawableCount: dc,
          glType: gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1',
        }
        console.warn('[Cubism5] ⚠️ 渲染失败 — ' + JSON.stringify(diag))
      }
    }
  }

  /**
   * 创建 MVP 矩阵
   * 构建链：projection × viewMatrix × modelMatrix
   * CubismMatrix44.multiplyByMatrix(m) 语义：this = m × this（左乘）
   */
  private createMvpMatrix(width: number, height: number): { getArray(): Float32Array } {
    const modelMatrix = this.model?.getModelMatrix()
    const viewMatrix = this.model?.getViewMatrix()

    const projection = new CubismMatrix44()
    if (width > height) {
      projection.scale(height / width, 1.0)
    } else {
      projection.scale(1.0, width / height)
    }

    // 目标：构建 projection × view × model
    // 注意：CubismMatrix44.multiplyByMatrix(m) 实现为 this = m × this（左乘），
    // 直接链式调用会导致顺序颠倒（变成 model × view × projection）。
    // 这里使用静态 multiply 来按正确顺序计算结果数组，再封装回 CubismMatrix44。

    const a = projection.getArray()
    const tmp = new Float32Array(16)
    const tmp2 = new Float32Array(16)

    // tmp = projection × view (or projection if no view)
    if (viewMatrix) {
      CubismMatrix44.multiply(a, viewMatrix.getArray(), tmp)
    } else {
      tmp.set(a)
    }

    // tmp2 = tmp × model (or tmp if no model)
    if (modelMatrix) {
      CubismMatrix44.multiply(tmp, modelMatrix.getArray(), tmp2)
    } else {
      tmp2.set(tmp)
    }

    const mvp = new CubismMatrix44()
    mvp.setMatrix(tmp2)
    return { getArray: () => mvp.getArray() }
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
   * 获取动作队列状态（供管理页面显示）
   * ★ 修复：null 安全 — release() 后 _motions 为 null，需要保护
   */
  getMotionQueueStatus(): { isFinished: boolean; queueLength: number; currentPriority: number } | null {
    if (!this.model) return null
    try {
      return this.model.getMotionQueueStatus()
    } catch {
      return null
    }
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

      // ★ 关键修复：设置 renderer 的 offscreen render target 尺寸
      const renderer = appModel.getRenderer()
      if (renderer && this.canvas) {
        renderer.setRenderState(null, [0, 0, this.canvas.width, this.canvas.height])
      }

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
    this._shaderReadyNotified = false
    this._onShaderReady = null
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
