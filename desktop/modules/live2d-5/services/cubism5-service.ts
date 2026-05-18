/**
 * Live2D Cubism 5 原生渲染服务
 * 不依赖 pixi.js，直接使用 Cubism 5 Framework + WebGL
 */
import type {
  Cubism5ModelState,
  Cubism5ModelConfig,
  StateCallback,
  MotionGroup,
  Cubism3ModelJson,
  CubismFrameworkLike,
  CubismMocLike,
  CubismModelLike,
  CubismRendererLike
} from '../types'

// ============ 常量 ============

/** 默认模型缩放比例 */
const DEFAULT_MODEL_SCALE = 0.15

/** Live2D Core SDK 路径 */
const CUBISM_CORE_SDK_PATH = '/modules/live2d-5/lib/live2dcubismcore.min.js'

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

  // Cubism Framework 对象
  private framework: CubismFrameworkLike | null = null
  private model: CubismModelLike | null = null
  private moc: CubismMocLike | null = null

  // WebGL 相关
  private gl: WebGLRenderingContext | null = null
  private canvas: HTMLCanvasElement | null = null

  // 模型配置
  private expressions: string[] = []
  private motions: MotionGroup[] = []
  private modelPath = ''

  // 动作/表情管理器（动态导入后缓存）
  private expressionManager: unknown = null
  private motionManager: unknown = null

  // 时间追踪（用于动作更新）
  private lastUpdateTime = 0

  setStateCallback(cb: StateCallback | null): void {
    this.onStateChange = cb
  }

  getState(): Cubism5ModelState {
    return this.state
  }

  getExpressions(): string[] {
    return this.expressions
  }

  getMotions(): MotionGroup[] {
    return this.motions
  }

  /**
   * 加载 Cubism 5 Core SDK
   */
  async loadSDK(): Promise<void> {
    if (this.sdkLoaded) return

    this.updateState('loading')

    try {
      const win = window as WindowWithCubism
      if (win.Live2DCubismCore) {
        console.log('[Cubism5] Core SDK 已存在')
        this.sdkLoaded = true
        this.updateState('idle')
        return
      }

      // 动态加载 Cubism 5 Core SDK
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = CUBISM_CORE_SDK_PATH
        script.onload = () => {
          console.log('[Cubism5] ✅ Core SDK 加载成功')
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
  private async initFramework(): Promise<CubismFrameworkLike> {
    if (this.framework) return this.framework

    const frameworkModule = await import('../lib/live2dcubismframework')
    const CubismFramework = (frameworkModule.CubismFramework ?? frameworkModule.default) as CubismFrameworkLike

    if (CubismFramework.startUp) {
      CubismFramework.startUp()
    }
    if (CubismFramework.initialize) {
      CubismFramework.initialize()
    }

    this.framework = CubismFramework
    return this.framework
  }

  /**
   * 加载模型（原生 Cubism 5 渲染）
   */
  async loadModel(config: Cubism5ModelConfig, container: HTMLElement): Promise<void> {
    if (!this.sdkLoaded) {
      await this.loadSDK()
    }

    this.updateState('loading')
    this.modelPath = config.modelPath

    try {
      // 初始化 Framework
      await this.initFramework()

      // 动态导入模型相关模块
      const { CubismMoc } = await import('../lib/model/cubismmoc')

      // 获取 canvas 或创建
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

      // 加载模型文件
      const response = await fetch(config.modelPath)
      const modelJson = (await response.json()) as Cubism3ModelJson

      // 加载 moc 文件
      const mocPath = new URL(modelJson.FileReferences.Moc, config.modelPath).href
      const mocResponse = await fetch(mocPath)
      const mocBuffer = await mocResponse.arrayBuffer()

      // 创建 Moc（使用正确的 API：CubismMoc.create）
      this.moc = CubismMoc.create(mocBuffer, false) as unknown as CubismMocLike
      if (!this.moc) {
        throw new Error('Moc 创建失败')
      }

      // 创建模型
      this.model = (this.moc as unknown as { createModel: () => CubismModelLike | null }).createModel()
      if (!this.model) {
        throw new Error('模型创建失败')
      }

      // 加载纹理
      await this.loadTextures(modelJson, config.modelPath)

      // 加载动作和表情配置
      this.loadMotionAndExpressionConfig(modelJson)

      // 初始化渲染器
      await this.initRenderer()

      // 设置模型参数（应用 scale）
      const scale = config.scale ?? DEFAULT_MODEL_SCALE
      this.model.getModel().setPixelSize(this.canvas.width, this.canvas.height)
      // 通过 ModelMatrix 应用缩放
      try {
        const modelMatrix = (this.model as unknown as { getModelMatrix?: () => { setScale: (x: number, y: number) => void } }).getModelMatrix?.()
        if (modelMatrix) {
          modelMatrix.setScale(scale, scale)
        }
      } catch {
        // ModelMatrix 不可用时忽略
      }

      // 初始化动作/表情管理器
      await this.initMotionManagers()

      // 重置时间
      this.lastUpdateTime = performance.now() / 1000

      this.updateState('loaded')
      console.log('[Cubism5] ✅ 模型加载完成:', config.name)

      // 开始渲染循环
      this.startRenderLoop()
    } catch (err) {
      console.error('[Cubism5] ❌ 模型加载失败:', err)
      this.updateState('error')
      throw err
    }
  }

  /**
   * 初始化动作和表情管理器
   */
  private async initMotionManagers(): Promise<void> {
    try {
      const { CubismExpressionMotionManager } = await import('../lib/motion/cubismexpressionmotionmanager')
      const { CubismMotionManager } = await import('../lib/motion/cubismmotionmanager')

      this.expressionManager = new CubismExpressionMotionManager()
      this.motionManager = new CubismMotionManager()
    } catch (err) {
      console.warn('[Cubism5] 动作/表情管理器初始化失败:', err)
    }
  }

  /**
   * 加载纹理
   */
  private async loadTextures(modelJson: Cubism3ModelJson, basePath: string): Promise<void> {
    const textures = modelJson.FileReferences.Textures
    if (!textures) return

    for (let i = 0; i < textures.length; i++) {
      const texturePath = new URL(textures[i], basePath).href
      const texture = await this.loadTexture(texturePath)
      if (texture) {
        if (this.model?.setTexture) {
          this.model.setTexture(i, texture)
        }
      }
    }
  }

  /**
   * 加载单个纹理
   */
  private loadTexture(url: string): Promise<WebGLTexture | null> {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const gl = this.gl
        if (!gl) {
          resolve(null)
          return
        }
        const texture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.generateMipmap(gl.TEXTURE_2D)
        resolve(texture)
      }
      img.onerror = () => resolve(null)
      img.src = url
    })
  }

  /**
   * 加载动作和表情配置
   */
  private loadMotionAndExpressionConfig(modelJson: Cubism3ModelJson): void {
    const refs = modelJson.FileReferences

    // 提取表情列表
    if (refs.Expressions) {
      this.expressions = refs.Expressions.map((e) => e.Name)
    }

    // 提取动作列表
    if (refs.Motions) {
      this.motions = Object.entries(refs.Motions).map(([group, motionList]) => ({
        group,
        names: motionList.map((m) => {
          const fileName = m.File.split('/').pop() ?? group
          return fileName.replace('.motion3.json', '')
        })
      }))
    }
  }

  /**
   * 初始化渲染器
   */
  private async initRenderer(): Promise<void> {
    if (!this.gl || !this.model) return

    const rendererModule = await import('../lib/rendering/cubismrenderer_webgl')
    const CubismRenderer_WebGL = rendererModule.CubismRenderer_WebGL as {
      startUp: (gl: WebGLRenderingContext) => void
      create: () => CubismRendererLike | null
    }

    CubismRenderer_WebGL.startUp(this.gl)
    const renderer = CubismRenderer_WebGL.create()
    if (renderer) {
      renderer.initialize(this.model.getModel())
      renderer.isPremultipliedAlpha = true
      this.model.setRenderer(renderer)
    }
  }

  /**
   * 开始渲染循环
   */
  private startRenderLoop(): void {
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
    if (!this.gl || !this.model || !this.canvas) return

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

    // 更新动作和表情
    this.updateMotionAndExpression(deltaTime)

    // 更新模型
    const model = this.model.getModel()
    model.update()

    // 渲染
    const renderer = this.model.getRenderer()
    if (renderer) {
      renderer.setMvpMatrix(this.createMvpMatrix(canvas.width, canvas.height))
      renderer.drawModel()
    }
  }

  /**
   * 更新动作和表情状态
   */
  private updateMotionAndExpression(deltaTimeSeconds: number): void {
    if (!this.model) return

    const model = this.model.getModel() as unknown as import('../lib/model/cubismmodel').CubismModel

    // 更新表情
    if (this.expressionManager) {
      try {
        (this.expressionManager as { updateParameters: (model: unknown, dt: number) => boolean })
          .updateParameters(model, deltaTimeSeconds)
      } catch {
        // 表情更新失败忽略
      }
    }

    // 更新动作
    if (this.motionManager) {
      try {
        (this.motionManager as { updateParameters: (model: unknown, dt: number) => boolean })
          .updateParameters(model, deltaTimeSeconds)
      } catch {
        // 动作更新失败忽略
      }
    }
  }

  /**
   * 创建 MVP 矩阵（正交投影）
   */
  private createMvpMatrix(width: number, height: number): Float32Array {
    const mvp = new Float32Array(16)
    mvp[0] = 2 / width
    mvp[5] = -2 / height
    mvp[10] = 1
    mvp[12] = -1
    mvp[13] = 1
    mvp[15] = 1
    return mvp
  }

  /**
   * 切换表情
   * 从模型文件中加载对应表情文件并播放
   */
  async setExpression(expressionId: string): Promise<void> {
    if (!this.model || !this.expressionManager) {
      console.warn('[Cubism5] 模型未加载或表情管理器不可用')
      return
    }

    try {
      // 从 model3.json 中查找表情文件
      const response = await fetch(this.modelPath)
      const modelJson = (await response.json()) as Cubism3ModelJson
      const expressionDef = modelJson.FileReferences.Expressions?.find(
        (e) => e.Name === expressionId
      )

      if (!expressionDef) {
        console.warn(`[Cubism5] 表情 "${expressionId}" 未找到`)
        return
      }

      // 加载表情文件
      const expPath = new URL(expressionDef.File, this.modelPath).href
      const expResponse = await fetch(expPath)
      const expBuffer = await expResponse.arrayBuffer()

      // 创建表情动作
      const { CubismExpressionMotion } = await import('../lib/motion/cubismexpressionmotion')
      const expression = CubismExpressionMotion.create(expBuffer, expBuffer.byteLength)

      if (expression) {
        // 开始播放表情
        const mgr = this.expressionManager as { startMotion: (motion: unknown, autoDelete: boolean) => unknown }
        mgr.startMotion(expression, false)
        console.log(`[Cubism5] ✅ 切换表情: ${expressionId}`)
      }
    } catch (err) {
      console.error(`[Cubism5] ❌ 切换表情失败: ${expressionId}`, err)
    }
  }

  /**
   * 播放动作
   * 从模型文件中加载对应动作文件并播放
   */
  async playMotion(motionId: string): Promise<void> {
    if (!this.model || !this.motionManager) {
      console.warn('[Cubism5] 模型未加载或动作管理器不可用')
      return
    }

    try {
      // 从 model3.json 中查找动作文件
      const response = await fetch(this.modelPath)
      const modelJson = (await response.json()) as Cubism3ModelJson

      // 遍历所有动作组查找匹配的动作
      let motionPath: string | null = null
      if (modelJson.FileReferences.Motions) {
        for (const [, motionList] of Object.entries(modelJson.FileReferences.Motions)) {
          for (const m of motionList) {
            const fileName = m.File.split('/').pop()?.replace('.motion3.json', '') ?? ''
            if (fileName === motionId) {
              motionPath = new URL(m.File, this.modelPath).href
              break
            }
          }
          if (motionPath) break
        }
      }

      if (!motionPath) {
        console.warn(`[Cubism5] 动作 "${motionId}" 未找到`)
        return
      }

      // 加载动作文件
      const motionResponse = await fetch(motionPath)
      const motionBuffer = await motionResponse.arrayBuffer()

      // 创建动作
      const { CubismMotion } = await import('../lib/motion/cubismmotion')
      const motion = CubismMotion.create(motionBuffer, motionBuffer.byteLength)

      if (motion) {
        // 开始播放动作（优先级 300 = 普通优先级）
        const mgr = this.motionManager as {
          startMotionPriority: (motion: unknown, autoDelete: boolean, priority: number) => unknown
        }
        mgr.startMotionPriority(motion, false, 300)
        console.log(`[Cubism5] ✅ 播放动作: ${motionId}`)
      }
    } catch (err) {
      console.error(`[Cubism5] ❌ 播放动作失败: ${motionId}`, err)
    }
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

    // 释放动作/表情管理器
    this.expressionManager = null
    this.motionManager = null

    // 释放渲染器
    if (this.model) {
      try {
        const renderer = this.model.getRenderer()
        if (renderer) {
          renderer.release()
          renderer.deleteRenderer()
        }
      } catch {
        // 忽略渲染器释放错误
      }
      this.model.release()
      this.model = null
    }

    // 释放 Moc
    if (this.moc) {
      try {
        (this.moc as unknown as { release: () => void }).release()
      } catch {
        // 忽略 moc 释放错误
      }
      this.moc = null
    }

    // 释放 WebGL 上下文
    if (this.gl) {
      try {
        const ext = this.gl.getExtension('WEBGL_lose_context')
        ext?.loseContext()
      } catch {
        // 忽略 WebGL 释放错误
      }
      this.gl = null
    }

    // 清理 canvas
    if (this.canvas?.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas)
    }
    this.canvas = null

    // 重置状态
    this.sdkLoaded = false
    this.framework = null
    this.expressions = []
    this.motions = []
    this.modelPath = ''
    this.lastUpdateTime = 0
    this.updateState('idle')
  }

  private updateState(newState: Cubism5ModelState): void {
    this.state = newState
    this.onStateChange?.(newState)
  }
}

// 单例导出
export const cubism5Service = new Cubism5Service()
