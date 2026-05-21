/**
 * Live2D Cubism 5 原生渲染服务
 * 不依赖 pixi.js，直接使用 Cubism 5 Framework + WebGL
 *
 * @see https://docs.live2d.com/4.2/zh-CHS/cubism-sdk-manual/model-web/
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

/** Live2D Core SDK 路径（public 目录下的绝对路径） */
const CUBISM_CORE_SDK_PATH = '/lib/live2dcubismcore5.min.js'

/** Cubism 5 Shader 路径（public 目录下的绝对路径） */
const CUBISM5_SHADER_PATH = '/Framework/Shaders/WebGL/'

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
  private renderer: CubismRendererLike | null = null

  // 模型配置
  private expressions: string[] = []
  private motions: MotionGroup[] = []
  private modelPath = ''
  private cachedModelJson: Cubism3ModelJson | null = null

  // 动作/表情管理器（动态导入后缓存）
  private expressionManager: unknown = null
  private motionManager: unknown = null

  // 时间追踪（用于动作更新）
  private lastUpdateTime = 0

  // WebGL 上下文丢失标志
  private contextLost = false

  // ModelMatrix（用于缩放和定位）
  private _modelMatrix: import('../lib/math/cubismmodelmatrix').CubismModelMatrix | null = null

  // CubismMatrix44 类引用（缓存，避免每次 import）
  private _Matrix44Class: (new () => { getArray(): Float32Array; setMatrix(tr: Float32Array): void }) | null = null

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
    if (this.sdkLoaded) {
      console.log('[Cubism5] ⏭️ SDK 已加载, 跳过')
      return
    }

    console.log('[Cubism5] 🔄 开始加载 SDK...')
    this.updateState('loading')

    try {
      const win = window as WindowWithCubism
      // 检测是否已有 Cubism 5 SDK（Cubism 4 没有 Memory 属性）
      if (win.Live2DCubismCore && (win.Live2DCubismCore as Record<string, unknown>).Memory) {
        console.log('[Cubism5] Core SDK 已存在 (Cubism 5)')
        this.sdkLoaded = true
        this.updateState('idle')
        return
      }

      if (win.Live2DCubismCore && !(win.Live2DCubismCore as Record<string, unknown>).Memory) {
        console.log('[Cubism5] ⚠️ 检测到 Cubism 4 SDK，需要加载 Cubism 5 SDK 覆盖')
      }

      // 动态加载 Cubism 5 Core SDK
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = CUBISM_CORE_SDK_PATH
        script.onload = () => {
          const win = window as WindowWithCubism
          if (win.Live2DCubismCore) {
            console.log('[Cubism5] Live2DCubismCore keys:', Object.keys(win.Live2DCubismCore))
          }
          this.sdkLoaded = true
          resolve()
        }
        script.onerror = (e) => {
          console.error('[Cubism5] ❌ Core SDK onerror 触发, 路径:', CUBISM_CORE_SDK_PATH, e)
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
    if (this.framework) {
      console.log('[Cubism5] ⏭️ Framework 已初始化, 跳过')
      return this.framework
    }

    console.log('[Cubism5] 🔄 初始化 Cubism Framework...')

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
    console.log('[Cubism5] 🚀 loadModel 开始, config:', JSON.stringify({ name: config.name, modelPath: config.modelPath, scale: config.scale }))
    console.log('[Cubism5] 🚀 sdkLoaded:', this.sdkLoaded, 'container:', !!container)

    if (!this.sdkLoaded) {
      await this.loadSDK()
    }

    this.updateState('loading')
    this.modelPath = config.modelPath

    try {
      // 初始化 Framework
      await this.initFramework()

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

      // 注册 WebGL 上下文丢失/恢复事件
      this.registerContextEvents()

      // 加载模型文件
      const response = await fetch(config.modelPath)
      if (!response.ok) {
        throw new Error(`加载模型配置失败: ${response.status} ${response.statusText} (${config.modelPath})`)
      }
      this.cachedModelJson = (await response.json()) as Cubism3ModelJson

      // 加载 moc 文件
      const mocPath = new URL(this.cachedModelJson.FileReferences.Moc, config.modelPath).href
      const mocResponse = await fetch(mocPath)
      if (!mocResponse.ok) {
        throw new Error(`加载 Moc 文件失败: ${mocResponse.status} ${mocResponse.statusText} (${mocPath})`)
      }
      const mocBuffer = await mocResponse.arrayBuffer()

      // 创建 Moc
      const CubismMocModule = await import('../lib/model/cubismmoc')
      const CubismMoc = CubismMocModule.CubismMoc

      this.moc = CubismMoc.create(mocBuffer, false) as unknown as CubismMocLike
      if (!this.moc) {
        throw new Error('Moc 创建失败（CubismMoc.create 返回 null）')
      }

      // 创建模型
      this.model = (this.moc as unknown as { createModel: () => CubismModelLike | null }).createModel()
      if (!this.model) {
        throw new Error('模型创建失败（createModel 返回 null）')
      }

      // 官方 API：保存初始参数状态
      this.model.saveParameters()

      // 初始化渲染器（使用 SDK 正确 API）— 必须在加载纹理之前，否则 this.renderer 为 null
      await this.initRenderer()

      // 加载纹理（需要 renderer 已初始化才能 bindTexture）
      await this.loadTextures(this.cachedModelJson, config.modelPath)

      // 加载动作和表情配置
      this.loadMotionAndExpressionConfig(this.cachedModelJson)

      // 预加载 shader（等待完成再启动渲染，避免空跑循环）
      console.log('[Cubism5] 🔄 预加载 shader...')
      const shaderReady = await this.renderer.waitForShaders(10000)
      if (shaderReady) {
        console.log('[Cubism5] ✅ shader 加载完成')
      } else {
        console.warn('[Cubism5] ⚠️ shader 加载超时，渲染可能异常')
      }

      // 通过 ModelMatrix 应用缩放
      const scale = config.scale ?? DEFAULT_MODEL_SCALE
      await this.applyModelScale(scale)

      // 初始化动作/表情管理器
      await this.initMotionManagers()

      // 重置时间
      this.lastUpdateTime = performance.now() / 1000

      this.updateState('loaded')
      console.log('[Cubism5] ✅ 模型加载完成:', config.name)

      // 开始渲染循环（shader 已就绪，不会空跑）
      this.startRenderLoop()
    } catch (err) {
      console.error('[Cubism5] ❌ 模型加载失败, 详细错误:', err)
      console.error('[Cubism5] ❌ modelPath:', config.modelPath)
      console.error('[Cubism5] ❌ window.location.href:', window.location.href)
      this.updateState('error')
      throw err
    }
  }

  /**
   * 应用模型缩放（通过 CubismModelMatrix，SDK 标准方式）
   * @see https://docs.live2d.com/4.2/zh-CHS/cubism-sdk-manual/model-web/
   */
  private async applyModelScale(scale: number): Promise<void> {
    if (!this.model || !this.canvas) return

    try {
      const { CubismModelMatrix } = await import('../lib/math/cubismmodelmatrix')
      // 缓存类引用供 createMvpMatrix 使用
      this._Matrix44Class = CubismModelMatrix

      const canvasWidth = this.model.getCanvasWidth()
      const canvasHeight = this.model.getCanvasHeight()

      // ===== 诊断：canvas 尺寸 =====
      const rawModel = (this.model as any)._model
      const pixelsPerUnit = rawModel?.canvasinfo?.PixelsPerUnit ?? 'N/A'
      const rawCanvasW = rawModel?.canvasinfo?.CanvasWidth ?? 'N/A'
      const rawCanvasH = rawModel?.canvasinfo?.CanvasHeight ?? 'N/A'
      console.log('[Cubism5-DEBUG] ===== 模型缩放诊断 =====')
      console.log('[Cubism5-DEBUG] PixelsPerUnit:', pixelsPerUnit)
      console.log('[Cubism5-DEBUG] Raw CanvasWidth:', rawCanvasW, 'CanvasHeight:', rawCanvasH)
      console.log('[Cubism5-DEBUG] getCanvasWidth():', canvasWidth, 'getCanvasHeight():', canvasHeight)
      console.log('[Cubism5-DEBUG] 用户 scale:', scale)

      // CubismModelMatrix 构造函数内部会调用 setHeight(2.0) 做一次归一化缩放
      // 但 scale() 是覆写，会覆盖掉。所以用 scaleRelative 累乘
      const modelMatrix = new CubismModelMatrix(canvasWidth, canvasHeight)

      // 诊断：构造后的内部状态
      const mmArr = modelMatrix.getArray()
      console.log('[Cubism5-DEBUG] CubismModelMatrix 构造后 (setHeight(2.0) 后):')
      console.log('[Cubism5-DEBUG]   scale:', mmArr[0], ',', mmArr[5])
      console.log('[Cubism5-DEBUG]   translate:', mmArr[12], ',', mmArr[13])

      // 用 scaleRelative 累乘，保留 setHeight(2.0) 的归一化
      modelMatrix.scaleRelative(scale, scale)

      // 居中模型（借鉴 pixi-live2d-display 的 anchor 0.5 + 居中定位）
      modelMatrix.centerX(this.canvas.width / 2)
      modelMatrix.centerY(this.canvas.height / 2)

      this._modelMatrix = modelMatrix

      // 诊断：最终 model matrix
      const finalArr = this._modelMatrix.getArray()
      console.log('[Cubism5-DEBUG] 最终 modelMatrix (scaleRelative + center):')
      console.log('[Cubism5-DEBUG]   scale:', finalArr[0], ',', finalArr[5])
      console.log('[Cubism5-DEBUG]   translate:', finalArr[12], ',', finalArr[13])
      console.log('[Cubism5-DEBUG] ===== 诊断结束 =====')
    } catch (err) {
      console.warn('[Cubism5] ModelMatrix 初始化失败:', err)
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
      // 停止渲染循环
      if (this.animFrameId !== null) {
        cancelAnimationFrame(this.animFrameId)
        this.animFrameId = null
      }
    })

    this.canvas.addEventListener('webglcontextrestored', () => {
      console.log('[Cubism5] ✅ WebGL 上下文恢复')
      this.contextLost = false
      // 重新初始化渲染器并恢复渲染循环
      this.recoverFromContextLost()
    })
  }

  /**
   * 从 WebGL 上下文丢失中恢复
   */
  private async recoverFromContextLost(): Promise<void> {
    if (!this.canvas || !this.model) return

    try {
      // 重新获取 WebGL 上下文
      this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl')
      if (!this.gl) {
        console.error('[Cubism5] ❌ 恢复 WebGL 上下文失败')
        this.updateState('error')
        return
      }

      // 重新初始化渲染器
      await this.initRenderer()

      // 重新加载纹理
      if (this.cachedModelJson) {
        await this.loadTextures(this.cachedModelJson, this.modelPath)
      }

      // 恢复渲染循环
      this.lastUpdateTime = performance.now() / 1000
      this.startRenderLoop()

      console.log('[Cubism5] ✅ 从上下文丢失中恢复完成')
    } catch (err) {
      console.error('[Cubism5] ❌ 恢复失败:', err)
      this.updateState('error')
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
      console.log(`[Cubism5] 🖼️ 加载纹理 ${i}/${textures.length}:`, texturePath)
      try {
        const texture = await this.loadTexture(texturePath)
        if (texture) {
          // Cubism SDK: 纹理绑定在 renderer 上，不是 model
          if (this.renderer) {
            (this.renderer as any).bindTexture(i, texture)
          }
          console.log(`[Cubism5] ✅ 纹理 ${i} 加载成功`)
        }
      } catch (err) {
        console.error(`[Cubism5] ❌ 纹理 ${i} 加载失败，跳过:`, err)
      }
    }
  }

  /**
   * 加载单个纹理
   */
  private loadTexture(url: string): Promise<WebGLTexture | null> {
    return new Promise((resolve, reject) => {
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
      img.onerror = () => {
        console.error(`[Cubism5] ❌ 纹理加载失败: ${url}`)
        reject(new Error(`纹理加载失败: ${url}`))
      }
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
   * 初始化渲染器（SDK 正确 API）
   *
   * Cubism SDK 官方用法（参考 CubismUserModel.createRenderer）：
   * 1. new CubismRenderer_WebGL(width, height)
   * 2. renderer.initialize(model, maskBufferCount)
   * 3. renderer.startUp(gl)  ← 渲染前调用
   */
  private async initRenderer(): Promise<void> {
    if (!this.gl || !this.model || !this.canvas) return

    const rendererModule = await import('../lib/rendering/cubismrenderer_webgl')
    const CubismRenderer_WebGL = rendererModule.CubismRenderer_WebGL

    // SDK 正确 API：new CubismRenderer_WebGL(width, height)
    const renderer = new CubismRenderer_WebGL(this.canvas.width, this.canvas.height)

    // 官方顺序：先 initialize(model)，再 startUp(gl)
    // 注意：必须传 CubismModel 包装类（有 isUsingMasking 等方法），不能传 getModel() 返回的原始核心对象
    renderer.initialize(this.model as unknown as import('../lib/model/cubismmodel').CubismModel)
    renderer.startUp(this.gl)
    renderer.setIsPremultipliedAlpha(true)

    // 存储 renderer 引用（纹理绑定和渲染都需要）
    this.renderer = renderer
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

  /** 首帧调试标记 */
  private _debugged = false
  /** 调试帧计数 */
  private _debugFrameCount?: number

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

    // ===== 首帧调试信息 =====
    if (!this._debugged) {
      this._debugged = true
      const renderer = this.renderer as any
      console.log('[Cubism5-DEBUG] ========== 首帧渲染调试 ==========')
      console.log('[Cubism5-DEBUG] canvas 尺寸:', canvas.width, 'x', canvas.height, 'clientWidth:', canvas.clientWidth, 'clientHeight:', canvas.clientHeight)
      console.log('[Cubism5-DEBUG] gl context:', gl ? 'OK' : 'NULL', 'isContextLost:', gl.isContextLost())
      console.log('[Cubism5-DEBUG] renderer:', renderer ? 'OK' : 'NULL')

      // shader 状态
      if (renderer) {
        try {
          console.log('[Cubism5-DEBUG] clippingManager:', renderer._drawableClippingManager ? '有' : '无')
          console.log('[Cubism5-DEBUG] _modelRenderTargets 长度:', renderer._modelRenderTargets?.length)
          console.log('[Cubism5-DEBUG] _drawableMasks 长度:', renderer._drawableMasks?.length)
          // ===== 诊断：shader 状态 =====
          console.log('[Cubism5-DEBUG] isShadersReady:', typeof renderer.isShadersReady === 'function' ? renderer.isShadersReady() : 'N/A')
        } catch (e) { console.log('[Cubism5-DEBUG] renderer 属性读取失败:', e) }
      }

      // 模型状态
      const model = this.model as any
      try {
        const drawCount = typeof model.getDrawableCount === 'function' ? model.getDrawableCount() : 'N/A'
        const paramCount = typeof model.getParameterCount === 'function' ? model.getParameterCount() : 'N/A'
        console.log('[Cubism5-DEBUG] drawableCount:', drawCount)
        console.log('[Cubism5-DEBUG] parameterCount:', paramCount)

        if (typeof model.getDrawableCount === 'function') {
          const dc = model.getDrawableCount()
          let visibleCount = 0
          for (let i = 0; i < dc; i++) {
            if (model.getDrawableDynamicFlagIsVisible?.(i)) visibleCount++
          }
          console.log('[Cubism5-DEBUG] 可见 drawable 数:', visibleCount, '/', dc)
        }

        // ===== 诊断：纹理绑定 =====
        console.log('[Cubism5-DEBUG] _textures 长度:', renderer?._textures?.size)
        if (renderer?._textures) {
          for (const [idx, tex] of renderer._textures) {
            console.log(`[Cubism5-DEBUG]   纹理[${idx}]:`, tex ? '有' : 'null')
          }
        }
      } catch (e) { console.log('[Cubism5-DEBUG] 模型属性读取失败:', e) }

      // MVP 矩阵
      try {
        const mvp = this.createMvpMatrix(canvas.width, canvas.height)
        const arr = mvp.getArray()
        console.log('[Cubism5-DEBUG] MVP 矩阵:', Array.from(arr.slice(0, 4)), Array.from(arr.slice(4, 8)), Array.from(arr.slice(8, 12)), Array.from(arr.slice(12, 16)))
      } catch (e) { console.log('[Cubism5-DEBUG] MVP 计算失败:', e) }

      // 检查 WebGL 错误
      const err = gl.getError()
      console.log('[Cubism5-DEBUG] gl.getError():', err, err === 0 ? '(无错误)' : '(有错误!)')

      // 检查 framebuffer 状态
      console.log('[Cubism5-DEBUG] framebuffer binding:', gl.getParameter(gl.FRAMEBUFFER_BINDING))
      console.log('[Cubism5-DEBUG] ========== 调试结束 ==========')
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

    // 更新模型（调用 CubismModel 包装器的 update，包含 resetDynamicFlags）
    this.model.update()

    // 渲染
    if (this.renderer) {
      this.renderer.setMvpMatrix(this.createMvpMatrix(canvas.width, canvas.height))
      this.renderer.drawModel()

      // 每帧检查 gl 错误（仅前 5 帧）
      if (this._debugFrameCount === undefined) this._debugFrameCount = 0
      if (this._debugFrameCount < 5) {
        this._debugFrameCount++
        const postErr = gl.getError()
        if (postErr !== 0) {
          console.warn(`[Cubism5-DEBUG] 第${this._debugFrameCount}帧 drawModel 后 gl.getError():`, postErr)
        }
        // ===== 诊断：首帧渲染后状态 =====
        if (this._debugFrameCount === 1) {
          console.log('[Cubism5-DEBUG] ===== 首帧渲染后 =====')
          console.log('[Cubism5-DEBUG] framebuffer binding:', gl.getParameter(gl.FRAMEBUFFER_BINDING))
          console.log('[Cubism5-DEBUG] viewport:', gl.getParameter(gl.VIEWPORT))
          // 读取 canvas 像素检查是否有内容
          try {
            const pixels = new Uint8Array(4)
            gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
            console.log('[Cubism5-DEBUG] canvas 中心像素 RGBA:', Array.from(pixels))
          } catch (e) { console.log('[Cubism5-DEBUG] readPixels 失败:', e) }
          console.log('[Cubism5-DEBUG] ===== 首帧渲染后结束 =====')
        }
      }
    }
  }

  /**
   * 更新动作和表情状态
   */
  private updateMotionAndExpression(deltaTimeSeconds: number): void {
    if (!this.model) return

    // 注意：必须传 CubismModel 包装类，不能传 getModel() 返回的原始核心对象
    const model = this.model as unknown as import('../lib/model/cubismmodel').CubismModel

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
   * 创建 MVP 矩阵（正交投影 × 模型矩阵）
   * 返回 CubismMatrix44 兼容对象以匹配 SDK 的 setMvpMatrix 签名
   * @see https://docs.live2d.com/4.2/zh-CHS/cubism-sdk-manual/model-web/
   */
  private createMvpMatrix(width: number, height: number): { getArray(): Float32Array; setMatrix(tr: Float32Array): void } {
    // _Matrix44Class 在 applyModelScale 中已缓存
    const MatrixClass = this._Matrix44Class
    if (!MatrixClass) {
      // fallback：如果还没缓存，返回简单包装
      const projection = new Float32Array(16)
      projection[0] = 2 / width
      projection[5] = -2 / height
      projection[10] = 1
      projection[12] = -1
      projection[13] = 1
      projection[15] = 1
      return { getArray: () => projection, setMatrix: () => {} }
    }

    const mvp = new (MatrixClass as any)()

    if (this._modelMatrix) {
      mvp.setMatrix(this._modelMatrix.getArray())
    }

    // 叠加正交投影
    const tr = mvp.getArray()
    const sx = 2 / width
    const sy = -2 / height
    for (let col = 0; col < 4; col++) {
      tr[0 * 4 + col] *= sx
      tr[1 * 4 + col] *= sy
    }

    return mvp
  }

  /**
   * 切换表情
   * 使用缓存的 modelJson，避免重复 fetch
   */
  async setExpression(expressionId: string): Promise<void> {
    if (!this.model || !this.expressionManager) {
      console.warn('[Cubism5] 模型未加载或表情管理器不可用')
      return
    }

    try {
      // 使用缓存的 modelJson，避免每次都 fetch
      if (!this.cachedModelJson) {
        const response = await fetch(this.modelPath)
        if (!response.ok) {
          throw new Error(`加载模型配置失败: ${response.status} ${response.statusText}`)
        }
        this.cachedModelJson = (await response.json()) as Cubism3ModelJson
      }

      const expressionDef = this.cachedModelJson.FileReferences.Expressions?.find(
        (e) => e.Name === expressionId
      )

      if (!expressionDef) {
        console.warn(`[Cubism5] 表情 "${expressionId}" 未找到`)
        return
      }

      // 加载表情文件
      const expPath = new URL(expressionDef.File, this.modelPath).href
      const expResponse = await fetch(expPath)
      if (!expResponse.ok) {
        throw new Error(`加载表情文件失败: ${expResponse.status} ${expResponse.statusText} (${expPath})`)
      }
      const expBuffer = await expResponse.arrayBuffer()
      console.log('[Cubism5] ✅ 表情文件加载成功, 大小:', expBuffer.byteLength, 'bytes')

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
   * 使用缓存的 modelJson，避免重复 fetch
   */
  async playMotion(motionId: string): Promise<void> {
    if (!this.model || !this.motionManager) {
      console.warn('[Cubism5] 模型未加载或动作管理器不可用')
      return
    }

    try {
      // 使用缓存的 modelJson，避免每次都 fetch
      if (!this.cachedModelJson) {
        const response = await fetch(this.modelPath)
        if (!response.ok) {
          throw new Error(`加载模型配置失败: ${response.status} ${response.statusText}`)
        }
        this.cachedModelJson = (await response.json()) as Cubism3ModelJson
      }

      // 遍历所有动作组查找匹配的动作
      let motionPath: string | null = null
      if (this.cachedModelJson.FileReferences.Motions) {
        for (const [, motionList] of Object.entries(this.cachedModelJson.FileReferences.Motions)) {
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
      if (!motionResponse.ok) {
        throw new Error(`加载动作文件失败: ${motionResponse.status} ${motionResponse.statusText} (${motionPath})`)
      }
      const motionBuffer = await motionResponse.arrayBuffer()
      console.log('[Cubism5] ✅ 动作文件加载成功, 大小:', motionBuffer.byteLength, 'bytes')

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
    if (this.renderer) {
      try {
        this.renderer.release()
      } catch {
        // 忽略渲染器释放错误
      }
      this.renderer = null
    }
    if (this.model) {
      try {
        this.model.release()
      } catch {
        // 忽略模型释放错误
      }
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
    this.cachedModelJson = null
    this.expressions = []
    this.motions = []
    this.modelPath = ''
    this.lastUpdateTime = 0
    this.contextLost = false
    this._modelMatrix = null
    this._Matrix44Class = null
    this.updateState('idle')
  }

  private updateState(newState: Cubism5ModelState): void {
    this.state = newState
    this.onStateChange?.(newState)
  }
}

// 单例导出
export const cubism5Service = new Cubism5Service()
