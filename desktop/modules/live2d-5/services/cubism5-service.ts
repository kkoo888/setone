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
    return CubismFramework
  }

  /**
   * 加载模型（原生 Cubism 5 渲染）
   */
  async loadModel(config: Cubism5ModelConfig, container: HTMLElement): Promise<void> {
    if (!this.sdkLoaded) {
      await this.loadSDK()
    }

    this.updateState('loading')

    try {
      // 初始化 Framework
      await this.initFramework()

      // 动态导入模型相关模块
      const { CubismMoc } = await import('../lib/model/cubismmoc')
      const { CubismModel } = await import('../lib/model/cubismmodel')

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

      // 创建 Moc
      this.moc = (CubismMoc as { fromArrayBuffer: (buf: ArrayBuffer) => CubismMocLike | null }).fromArrayBuffer(mocBuffer)
      if (!this.moc) {
        throw new Error('Moc 创建失败')
      }

      // 创建模型
      this.model = this.moc.createModel()
      if (!this.model) {
        throw new Error('模型创建失败')
      }

      // 加载纹理
      await this.loadTextures(modelJson, config.modelPath)

      // 加载动作和表情配置
      this.loadMotionAndExpressionConfig(modelJson)

      // 初始化渲染器
      await this.initRenderer()

      // 设置模型参数
      const scale = config.scale ?? DEFAULT_MODEL_SCALE
      void scale
      this.model.getModel().setPixelSize(this.canvas.width, this.canvas.height)

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
   */
  async setExpression(expressionId: string): Promise<void> {
    if (!this.model) return
    const model = this.model.getModel()
    const paramCount = model.getParameterCount()
    for (let i = 0; i < paramCount; i++) {
      const id = model.getParameterIds()[i]
      if (id && id.includes(expressionId)) {
        console.log('[Cubism5] 设置表情参数:', id)
      }
    }
  }

  /**
   * 播放动作
   */
  async playMotion(motionId: string): Promise<void> {
    if (!this.model) return
    console.log('[Cubism5] playMotion:', motionId)
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    if (this.model) {
      const renderer = this.model.getRenderer()
      if (renderer) {
        renderer.release()
        renderer.deleteRenderer()
      }
      this.model.release()
      this.model = null
    }

    if (this.moc) {
      this.moc.release()
      this.moc = null
    }

    this.gl = null
    this.canvas = null
    this.sdkLoaded = false
    this.updateState('idle')
  }

  private updateState(newState: Cubism5ModelState): void {
    this.state = newState
    this.onStateChange?.(newState)
  }
}

// 单例导出
export const cubism5Service = new Cubism5Service()
