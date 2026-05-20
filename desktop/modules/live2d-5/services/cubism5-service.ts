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

/** Live2D Core SDK 路径（相对路径，兼容 file:// 协议和 http） */
const CUBISM_CORE_SDK_PATH = './lib/live2dcubismcore5.min.js'

/** Cubism 5 Shader 路径（相对路径，兼容 file:// 协议） */
const CUBISM5_SHADER_PATH = './Framework/Shaders/WebGL/'

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
      if (win.Live2DCubismCore) {
        console.log('[Cubism5] Core SDK 已存在')
        this.sdkLoaded = true
        this.updateState('idle')
        return
      }

      // 动态加载 Cubism 5 Core SDK
      console.log('[Cubism5] 📦 加载 SDK, 路径:', CUBISM_CORE_SDK_PATH)
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = CUBISM_CORE_SDK_PATH
        script.onload = () => {
          console.log('[Cubism5] ✅ Core SDK onload 触发')
          const win = window as WindowWithCubism
          console.log('[Cubism5] Live2DCubismCore 存在:', !!win.Live2DCubismCore)
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
      console.log('[Cubism5] 📦 SDK 未加载, 开始加载...')
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
      console.log('[Cubism5] 📦 开始加载模型, window.location.href:', window.location.href)
      console.log('[Cubism5] 📦 modelPath:', config.modelPath)
      const response = await fetch(config.modelPath)
      if (!response.ok) {
        throw new Error(`加载模型配置失败: ${response.status} ${response.statusText} (${config.modelPath})`)
      }
      this.cachedModelJson = (await response.json()) as Cubism3ModelJson
      console.log('[Cubism5] ✅ model3.json 加载成功:', this.cachedModelJson)

      // 加载 moc 文件
      const mocPath = new URL(this.cachedModelJson.FileReferences.Moc, config.modelPath).href
      console.log('[Cubism5] 📦 mocPath:', mocPath)
      const mocResponse = await fetch(mocPath)
      if (!mocResponse.ok) {
        throw new Error(`加载 Moc 文件失败: ${mocResponse.status} ${mocResponse.statusText} (${mocPath})`)
      }
      const mocBuffer = await mocResponse.arrayBuffer()
      console.log('[Cubism5] ✅ Moc 文件加载成功, 大小:', mocBuffer.byteLength, 'bytes')

      // 创建 Moc — SDK API: CubismMoc.create(mocBytes, shouldCheckMocConsistency)
      console.log('[Cubism5] 📦 创建 Moc, buffer 大小:', mocBuffer.byteLength)

      // 检查 Live2DCubismCore 完整性
      const win = window as WindowWithCubism
      const core = win.Live2DCubismCore
      console.log('[Cubism5] 🔍 Live2DCubismCore 存在:', !!core)
      if (core) {
        console.log('[Cubism5] 🔍 core.Moc 存在:', !!(core as any).Moc)
        console.log('[Cubism5] 🔍 core.Moc.fromArrayBuffer 存在:', typeof (core as any).Moc?.fromArrayBuffer)
        console.log('[Cubism5] 🔍 core.Model 存在:', !!(core as any).Model)
        console.log('[Cubism5] 🔍 core.Model.fromMoc 存在:', typeof (core as any).Model?.fromMoc)
        console.log('[Cubism5] 🔍 core.Version 存在:', !!(core as any).Version)
        console.log('[Cubism5] 🔍 core keys:', Object.keys(core as any).join(', '))
        // 额外检查：尝试直接用 Core 创建 Moc
        try {
          const testMoc = (core as any).Moc.fromArrayBuffer(mocBuffer)
          console.log('[Cubism5] 🔍 Core Moc.fromArrayBuffer 结果:', !!testMoc)
          if (testMoc) {
            const testModel = (core as any).Model.fromMoc(testMoc)
            console.log('[Cubism5] 🔍 Core 直接 Model.fromMoc 结果:', !!testModel)
            if (testModel) {
              console.log('[Cubism5] 🔍 直接 drawables:', !!(testModel as any).drawables)
              console.log('[Cubism5] 🔍 直接 parameters:', !!(testModel as any).parameters)
            }
          }
        } catch (e) {
          console.error('[Cubism5] ❌ Core 直接测试失败:', e)
        }
      }

      const CubismMocModule = await import('../lib/model/cubismmoc')
      const CubismMoc = CubismMocModule.CubismMoc
      console.log('[Cubism5] 📦 CubismMoc 类加载成功, create 方法:', typeof CubismMoc?.create)

      this.moc = CubismMoc.create(mocBuffer, false) as unknown as CubismMocLike
      if (!this.moc) {
        throw new Error('Moc 创建失败（CubismMoc.create 返回 null）')
      }
      console.log('[Cubism5] ✅ Moc 创建成功, 类型:', typeof this.moc)

      // 创建模型
      console.log('[Cubism5] 📦 创建模型...')
      const mocInternal = this.moc as unknown as { _moc: any; createModel: () => any }
      console.log('[Cubism5] 🔍 moc._moc 存在:', !!mocInternal._moc)
      console.log('[Cubism5] 🔍 moc._moc 类型:', typeof mocInternal._moc)

      // 预检查：直接用 Core SDK 的 Model.fromMoc 验证
      if (core?.Model?.fromMoc) {
        const testModel = core.Model.fromMoc(mocInternal._moc)
        console.log('[Cubism5] 🔍 Core Model.fromMoc 结果:', !!testModel)
        if (testModel) {
          console.log('[Cubism5] 🔍 testModel.drawables 存在:', !!(testModel as any).drawables)
          console.log('[Cubism5] 🔍 testModel.parameters 存在:', !!(testModel as any).parameters)
          console.log('[Cubism5] 🔍 testModel.parts 存在:', !!(testModel as any).parts)
          if ((testModel as any).drawables) {
            console.log('[Cubism5] 🔍 testModel.drawables.count:', (testModel as any).drawables.count)
          }
          // 释放测试模型
          try { testModel.release?.() } catch {}
        }
      }

      this.model = (this.moc as unknown as { createModel: () => CubismModelLike | null }).createModel()
      if (!this.model) {
        throw new Error('模型创建失败（createModel 返回 null）')
      }
      console.log('[Cubism5] ✅ 模型创建成功')

      // 检查模型内部结构
      const internalModel = this.model.getModel()
      console.log('[Cubism5] 🔍 internalModel 存在:', !!internalModel)
      if (internalModel) {
        const im = internalModel as any
        console.log('[Cubism5] 🔍 internalModel 类型:', typeof im)
        console.log('[Cubism5] 🔍 internalModel.drawables 存在:', !!im.drawables)
        console.log('[Cubism5] 🔍 internalModel.parameters 存在:', !!im.parameters)
        console.log('[Cubism5] 🔍 internalModel.parts 存在:', !!im.parts)
        if (im.drawables) {
          console.log('[Cubism5] 🔍 drawables.count:', im.drawables.count)
        }
        console.log('[Cubism5] 🔍 getCanvasWidth:', im.getCanvasWidth?.())
        console.log('[Cubism5] 🔍 getCanvasHeight:', im.getCanvasHeight?.())
      }

      // 加载纹理
      await this.loadTextures(this.cachedModelJson, config.modelPath)

      // 加载动作和表情配置
      this.loadMotionAndExpressionConfig(this.cachedModelJson)

      // 初始化渲染器（使用 SDK 正确 API）
      await this.initRenderer()

      // 通过 ModelMatrix 应用缩放
      const scale = config.scale ?? DEFAULT_MODEL_SCALE
      await this.applyModelScale(scale)

      // 初始化动作/表情管理器
      await this.initMotionManagers()

      // 重置时间
      this.lastUpdateTime = performance.now() / 1000

      this.updateState('loaded')
      console.log('[Cubism5] ✅ 模型加载完成:', config.name)

      // 开始渲染循环
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
      const internalModel = this.model.getModel()
      if (!internalModel) return

      const modelMatrix = new CubismModelMatrix(
        internalModel.getCanvasWidth(),
        internalModel.getCanvasHeight()
      )
      modelMatrix.scale(scale, scale)
      // 存储到 service 上供渲染时使用
      this._modelMatrix = modelMatrix
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
   * Cubism SDK 正确用法：
   * 1. new CubismRenderer_WebGL(width, height)
   * 2. renderer.startUp(gl)
   * 3. renderer.initialize(model)
   */
  private async initRenderer(): Promise<void> {
    if (!this.gl || !this.model || !this.canvas) return

    const rendererModule = await import('../lib/rendering/cubismrenderer_webgl')
    const CubismRenderer_WebGL = rendererModule.CubismRenderer_WebGL as {
      new (width: number, height: number): CubismRendererLike & {
        startUp: (gl: WebGLRenderingContext) => void
      }
    }

    // SDK 正确 API：new CubismRenderer_WebGL(width, height)
    const renderer = new CubismRenderer_WebGL(this.canvas.width, this.canvas.height)

    // 设置 GL 上下文
    renderer.startUp(this.gl)

    // 初始化渲染器（关联模型）
    renderer.initialize(this.model.getModel())
    // 注意：isPremultipliedAlpha 是 getter，用 setIsPremultipliedAlpha 设置
    renderer.setIsPremultipliedAlpha(true)

    // 设置 shader 路径（打包后 shader 在 public/Framework/Shaders/WebGL/）
    try {
      const shaderModule = await import('../lib/rendering/cubismshader_webgl')
      const CubismShaderManager = shaderModule.CubismShaderManager_WebGL
      if (CubismShaderManager) {
        const shaderInstance = CubismShaderManager.getInstance().getShader(this.gl)
        if (shaderInstance?.setShaderPath) {
          shaderInstance.setShaderPath(CUBISM5_SHADER_PATH)
        }
      }
    } catch (e) {
      console.warn('[Cubism5] 设置 shader 路径失败:', e)
    }

    // 存储 renderer 引用（纹理绑定和渲染都需要）
    this.renderer = renderer as unknown as CubismRendererLike
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

    // 更新动作和表情
    this.updateMotionAndExpression(deltaTime)

    // 更新模型（调用 CubismModel 包装器的 update，包含 resetDynamicFlags）
    this.model.update()

    // 渲染
    if (this.renderer) {
      this.renderer.setMvpMatrix(this.createMvpMatrix(canvas.width, canvas.height))
      this.renderer.drawModel()
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
   * 创建 MVP 矩阵（正交投影 × 模型矩阵）
   * 返回带 getArray() 的对象以匹配 SDK 的 setMvpMatrix 签名
   * @see https://docs.live2d.com/4.2/zh-CHS/cubism-sdk-manual/model-web/
   */
  private createMvpMatrix(width: number, height: number): { getArray(): Float32Array } {
    // 如果有 ModelMatrix，直接用它（已经包含了模型变换）
    if (this._modelMatrix) {
      // ModelMatrix 本身就是 CubismMatrix44，直接用
      // 但需要叠加正交投影
      const mm = this._modelMatrix.getArray()
      const mvp = new Float32Array(16)
      // 正交投影 × 模型矩阵
      const sx = 2 / width
      const sy = -2 / height
      for (let col = 0; col < 4; col++) {
        mvp[0 * 4 + col] = sx * mm[0 * 4 + col]
        mvp[1 * 4 + col] = sy * mm[1 * 4 + col]
        mvp[2 * 4 + col] = mm[2 * 4 + col]
        mvp[3 * 4 + col] = -mm[0 * 4 + col] + mm[1 * 4 + col] + mm[3 * 4 + col]
      }
      return { getArray: () => mvp }
    }

    // 纯正交投影
    const projection = new Float32Array(16)
    projection[0] = 2 / width
    projection[5] = -2 / height
    projection[10] = 1
    projection[12] = -1
    projection[13] = 1
    projection[15] = 1
    return { getArray: () => projection }
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
      console.log('[Cubism5] 📦 加载表情:', expressionId, '→', expPath)
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
      console.log('[Cubism5] 📦 加载动作:', motionId, '→', motionPath)
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
    this.updateState('idle')
  }

  private updateState(newState: Cubism5ModelState): void {
    this.state = newState
    this.onStateChange?.(newState)
  }
}

// 单例导出
export const cubism5Service = new Cubism5Service()
