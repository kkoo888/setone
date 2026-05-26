/**
 * AppModel — 继承 CubismUserModel 的完整模型类
 *
 * 使用 SDK 标准加载链路，自动管理所有效果：
 * - 物理演算（头发/衣服摇摆）
 * - 自动眨眼
 * - 呼吸效果
 * - 鼠标注视
 * - Pose 切换
 * - 表情/动作管理
 * - LipSync（口型同步）
 *
 * @see CubismUserModel (lib/model/cubismusermodel.ts)
 */

import { CubismUserModel } from '../lib/model/cubismusermodel'
import { CubismFramework } from '../lib/live2dcubismframework'
import { CubismModelSettingJson } from '../lib/cubismmodelsettingjson'
import { CubismEyeBlink } from '../lib/effect/cubismeyeblink'
import { CubismBreath, BreathParameterData } from '../lib/effect/cubismbreath'
import { CubismLook, LookParameterData } from '../lib/effect/cubismlook'
import { CubismPose } from '../lib/effect/cubismpose'
import { CubismPhysics } from '../lib/physics/cubismphysics'
import { CubismUpdateScheduler } from '../lib/motion/cubismupdatescheduler'
import { CubismEyeBlinkUpdater } from '../lib/motion/cubismeyeblinkupdater'
import { CubismBreathUpdater } from '../lib/motion/cubismbreathupdater'
import { CubismLookUpdater } from '../lib/motion/cubismlookupdater'
import { CubismPhysicsUpdater } from '../lib/motion/cubismphysicsupdater'
import { CubismExpressionUpdater } from '../lib/motion/cubismexpressionupdater'
import { CubismPoseUpdater } from '../lib/motion/cubismposeupdater'
import { CubismLipSyncUpdater } from '../lib/motion/cubismlipsyncupdater'
import { CubismMotion } from '../lib/motion/cubismmotion'
import { CubismExpressionMotion } from '../lib/motion/cubismexpressionmotion'
import { ACubismMotion } from '../lib/motion/acubismmotion'
import { CubismTargetPoint } from '../lib/math/cubismtargetpoint'
import { CubismIdHandle } from '../lib/id/cubismid'
import { CubismViewMatrix } from '../lib/math/cubismviewmatrix'
import { CubismMatrix44 } from '../lib/math/cubismmatrix44'
import { WavFileHandler } from './WavFileHandler'
import { needsOptimization, calculateScaledSize } from '../utils/texture-optimizer'

// ★ 动作优先级常量（与 Demo LAppDefine 一致）
const PriorityNone = 0
const PriorityIdle = 100
const PriorityNormal = 200
const PriorityForce = 300

/** 动作回调类型 */
type MotionCallback = () => void

/** 模型配置 */
export interface AppModelConfig {
  readonly name: string
  readonly modelPath: string
  readonly scale?: number
}

/**
 * AppModel — 继承 CubismUserModel
 * 使用 SDK 标准方法加载模型和所有效果
 */
export class AppModel extends CubismUserModel {
  private _updateScheduler: CubismUpdateScheduler | null = null
  private _eyeBlink: CubismEyeBlink | null = null
  private _breath: CubismBreath | null = null
  private _look: CubismLook | null = null
  private _pose: CubismPose | null = null
  private _physics: CubismPhysics | null = null
  private _lipSyncUpdater: CubismLipSyncUpdater | null = null

  private _setting: CubismModelSettingJson | null = null
  private _modelPath: string = ''
  private _modelDir: string = ''

  // ViewMatrix 逻辑坐标系
  private _viewMatrix: CubismViewMatrix | null = null
  private _deviceToScreen: CubismMatrix44 | null = null

  /** 获取 ViewMatrix（供 createMvpMatrix 使用） */
  getViewMatrix(): CubismViewMatrix | null { return this._viewMatrix }
  /** 获取 DeviceToScreen 矩阵（供 createMvpMatrix 使用） */
  getDeviceToScreen(): CubismMatrix44 | null { return this._deviceToScreen }

  // 动作预加载缓存
  private _motionCache: Map<string, CubismMotion> = new Map()
  // 表情预加载缓存
  private _expressionCache: Map<string, CubismExpressionMotion> = new Map()

  // 表情/动作列表（对外暴露）
  private _expressionNames: string[] = []
  private _motionGroups: Array<{ group: string; names: string[] }> = []

  // 眨眼/唇动参数 ID 列表
  private _eyeBlinkIds: CubismIdHandle[] = []
  private _lipSyncIds: CubismIdHandle[] = []

  // 当前播放状态追踪
  private _currentExpression: string = ''
  private _currentMotion: string = ''

  // ★ 新增：WAV 音频处理器（用于 LipSync）
  private _wavFileHandler: WavFileHandler = new WavFileHandler()

  // ★ 新增：麦克风音频处理器（用于实时 LipSync）
  private _microphoneHandler: MicrophoneHandler | null = null
  private _useMicrophone: boolean = false

  // 帧内动作更新标志（与 Demo _motionUpdated 一致）
  private _motionUpdated: boolean = false

  // ★ 新增：点击身体时播放的动作组名（从 model3.json 动态检测）
  private _tapMotionGroup: string = 'TapBody'

  /** 表情名称列表 */
  get expressionNames(): string[] {
    return this._expressionNames
  }

  /** 动作分组列表 */
  get motionGroups(): Array<{ group: string; names: string[] }> {
    return this._motionGroups
  }

  /** 当前播放的表情名称 */
  getCurrentExpression(): string {
    return this._currentExpression || '默认'
  }

  /** 当前播放的动作名称 */
  getCurrentMotion(): string {
    return this._currentMotion || '默认'
  }

  /**
   * 加载模型资源（SDK 标准流程）
   *
   * ★ 关键修复：接收 gl 参数，在 loadTextures 之前先 startUp(gl)
   * Demo 的正确顺序：startUp(gl) → loadTextures → createRenderer → drawModel
   *
   * @param model3Path model3.json 的完整路径
   * @param scale 缩放比例（默认 0.15）
   * @param gl WebGL 上下文（必须传入，纹理加载需要）
   */
  async loadAssets(
    model3Path: string,
    scale: number = 0.15,
    gl?: WebGLRenderingContext | WebGL2RenderingContext
  ): Promise<void> {
    this._modelPath = model3Path
    this._modelDir = model3Path.substring(0, model3Path.lastIndexOf('/') + 1)

    // 1. 加载 model3.json
    const response = await fetch(model3Path)
    if (!response.ok) {
      throw new Error(`加载 model3.json 失败: ${response.status} ${response.statusText}`)
    }
    const buffer = await response.arrayBuffer()
    const size = buffer.byteLength

    // 2. 创建 CubismModelSettingJson（官方解析器）
    this._setting = new CubismModelSettingJson(buffer, size)

    // 3. 加载 .moc3 → 创建模型
    await this.loadMoc()

    // 4. 读取 Layout 配置
    this.setupLayout()

    // 5. 创建渲染器（先创建，再 startUp）
    this.setupRenderer()

    // 6. ★ 关键修复：注入 GL 上下文（Demo 顺序：startUp 在 loadTextures 之前）
    if (gl) {
      this.getRenderer().startUp(gl)
      this.getRenderer().setIsPremultipliedAlpha(true)
    }

    // 7. 加载纹理（此时 renderer.gl 已就绪）
    await this.loadTextures()

    // 8. 加载物理演算
    await this.loadPhysicsData()

    // 9. 加载 Pose
    await this.loadPoseData()

    // 10. 初始化 ViewMatrix
    const model = this.getModel()
    const canvasW = model.getCanvasWidth() || 1024
    const canvasH = model.getCanvasHeight() || 1024
    this.setupViewMatrix(canvasW, canvasH)

    // 11. 初始化所有效果 Updater
    this.setupUpdaters()

    // 12. 读取眨眼/唇动参数 ID
    this.setupEffectIds()

    // 13. 加载用户数据（与 Demo loadUserData 一致）
    await this.loadUserDataFile()

    // 14. 预加载表情
    await this.preloadExpressions()

    // 14. 预加载动作
    await this.preloadMotions()

    // 15. ★ 新增：预加载完毕后重置动作管理器状态（与 Demo 一致）
    this._motionManager.stopAllMotions()

    // 16. 应用缩放
    this.applyScale(scale)

    // 18. 标记初始化完成
    this.setInitialized(true)
  }

  /** 加载 moc3 文件并创建模型 */
  private async loadMoc(): Promise<void> {
    const mocFile = this._setting.getModelFileName()
    const mocPath = this._modelDir + mocFile

    const response = await fetch(mocPath)
    if (!response.ok) {
      throw new Error(`加载 .moc3 失败: ${response.status} ${response.statusText} (${mocPath})`)
    }
    const buffer = await response.arrayBuffer()

    // 启用 mocConsistency 检查
    this.loadModel(buffer, true)
  }

  /**
   * 从 modelSetting 读取 Layout 配置并应用到模型矩阵
   */
  private setupLayout(): void {
    if (!this._setting) return
    const layout = new Map<string, number>()
    this._setting.getLayoutMap(layout)

    const modelMatrix = this.getModelMatrix()
    if (!modelMatrix) return

    if (layout.size > 0) {
      modelMatrix.setupFromLayout(layout)
      console.debug('[AppModel] Layout 已从 model3.json 应用')
    } else {
      // ★ 修复：没有 Layout 段时，确保模型矩阵正确映射到可视范围
      // CubismModelMatrix 构造函数已调用 setHeight(2.0)，理论上模型应在 -1~1 范围
      // 但如果没有 Layout，模型可能不在正确位置，这里加日志确认
      const model = this.getModel()
      const canvasW = model.getCanvasWidth()
      const canvasH = model.getCanvasHeight()
      console.debug(`[AppModel] 无 Layout 段，Canvas: ${canvasW.toFixed(2)} x ${canvasH.toFixed(2)}`)
    }
  }

  /** 加载纹理 */
  private async loadTextures(): Promise<void> {
    const count = this._setting.getTextureCount()
    console.debug(`[AppModel] 纹理数量: ${count}, 模型目录: ${this._modelDir}`)
    if (count === 0) {
      console.warn('[AppModel] ⚠️ 没有纹理文件')
      return
    }

    let loadedCount = 0
    let failedCount = 0

    for (let i = 0; i < count; i++) {
      const texFile = this._setting.getTextureFileName(i)
      if (!texFile) {
        console.warn(`[AppModel] ⚠️ 纹理 [${i}] 文件名为空，跳过`)
        continue // Demo: 空文件名跳过
      }

      const texPath = this._modelDir + texFile
      console.debug(`[AppModel] 🖼️ 加载纹理 [${i}/${count}]: ${texPath}`)
      try {
        const texture = await this.loadTextureImage(texPath)
        if (texture) {
          this.getRenderer().bindTexture(i, texture)
          loadedCount++
          console.debug(`[AppModel] ✅ 纹理 [${i}] 加载成功`)
        } else {
          failedCount++
          console.warn(`[AppModel] ⚠️ 纹理 [${i}] 返回 null`)
        }
      } catch (err) {
        failedCount++
        console.error(`[AppModel] ❌ 纹理 [${i}] 加载异常:`, err)
      }
    }

    console.debug(`[AppModel] 纹理加载完成: ${loadedCount}/${count} 成功, ${failedCount} 失败`)

    // ★ 修复：纹理全部失败时抛出异常，不能静默
    if (loadedCount === 0 && failedCount > 0) {
      throw new Error(`所有纹理加载失败（${failedCount} 个），模型无法显示`)
    }

    if (failedCount > 0) {
      console.warn(`[AppModel] ⚠️ ${failedCount}/${count} 个纹理加载失败`)
    }
  }

  /** 加载单个纹理图片 → WebGLTexture */
  private loadTextureImage(url: string): Promise<WebGLTexture | null> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        // ★ 修复：renderer 的 GL 属性是 gl（公开属性），不是 _gl
        const renderer = this.getRenderer()
        if (!renderer) {
          console.warn(`[AppModel] ⚠️ 渲染器不可用，跳过纹理: ${url}`)
          resolve(null)
          return
        }
        const gl = renderer.gl as WebGLRenderingContext | null
        if (!gl || gl.isContextLost()) {
          console.warn(`[AppModel] ⚠️ GL 上下文不可用或已丢失，跳过纹理: ${url}`)
          resolve(null)
          return
        }

        // 纹理尺寸优化（使用 texture-optimizer 工具）
        let source: HTMLImageElement | HTMLCanvasElement = img
        const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096
        if (needsOptimization(img.naturalWidth, img.naturalHeight, { maxWidth: maxTextureSize, maxHeight: maxTextureSize })) {
          const { width, height } = calculateScaledSize(img.naturalWidth, img.naturalHeight, maxTextureSize, maxTextureSize)
          console.debug(`[AppModel] 纹理过大 (${img.naturalWidth}x${img.naturalHeight})，缩放至 ${width}x${height}`)
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(img, 0, 0, width, height)
            source = canvas
          }
        }

        const texture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, texture)
        // ★ 修复：纹理存储为 straight alpha，但 blend mode 期望 premultiplied alpha
        // 设置 UNPACK_PREMULTIPLY_ALPHA_WEBGL 让 WebGL 在上传时自动转换
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.generateMipmap(gl.TEXTURE_2D)
        resolve(texture)
      }
      img.onerror = () => {
        console.error(`[AppModel] ❌ 纹理加载失败: ${url}`)
        reject(new Error(`纹理加载失败: ${url}`))
      }
      img.src = url
    })
  }

  /** 加载物理演算数据 */
  private async loadPhysicsData(): Promise<void> {
    const physicsFile = this._setting.getPhysicsFileName()
    if (!physicsFile) return

    const physicsPath = this._modelDir + physicsFile
    const response = await fetch(physicsPath)
    if (!response.ok) {
      console.warn(`[AppModel] ⚠️ 物理文件加载失败: ${response.status}`)
      return
    }
    const buffer = await response.arrayBuffer()
    this.loadPhysics(buffer, buffer.byteLength)
  }

  /** 加载 Pose 数据 */
  private async loadPoseData(): Promise<void> {
    const poseFile = this._setting.getPoseFileName()
    if (!poseFile) return

    const posePath = this._modelDir + poseFile
    const response = await fetch(posePath)
    if (!response.ok) {
      console.warn(`[AppModel] ⚠️ Pose 文件加载失败: ${response.status}`)
      return
    }
    const buffer = await response.arrayBuffer()
    this.loadPose(buffer, buffer.byteLength)
  }

  /**
   * 加载用户数据（与 Demo loadUserData 一致）
   * 用户数据通常包含点击区域的附加信息等
   */
  private async loadUserDataFile(): Promise<void> {
    if (!this._setting) return
    const userDataFile = this._setting.getUserDataFile()
    if (!userDataFile) return

    const userDataPath = this._modelDir + userDataFile
    try {
      const response = await fetch(userDataPath)
      if (!response.ok) {
        console.warn(`[AppModel] ⚠️ 用户数据加载失败: ${response.status}`)
        return
      }
      const buffer = await response.arrayBuffer()
      // CubismUserModel.loadUserData
      this.loadUserData(buffer, buffer.byteLength)
    } catch (err) {
      console.warn(`[AppModel] ⚠️ 用户数据加载异常:`, err)
    }
  }

  /** 创建渲染器（CubismUserModel.createRenderer） */
  private setupRenderer(): void {
    const model = this.getModel()
    const width = model.getCanvasWidth() || 1024
    const height = model.getCanvasHeight() || 1024
    this.createRenderer(width, height)
  }

  /**
   * 初始化 ViewMatrix 逻辑坐标系
   * 用于设备坐标 → 模型空间坐标的变换
   * ★ 修正：确保模型居中显示
   */
  private setupViewMatrix(canvasWidth: number, canvasHeight: number): void {
    this._viewMatrix = new CubismViewMatrix()
    this._deviceToScreen = new CubismMatrix44()

    const ratio = canvasWidth / canvasHeight
    const left = -ratio
    const right = ratio
    const bottom = -1.0
    const top = 1.0

    this._viewMatrix.setScreenRect(left, right, bottom, top)
    this._viewMatrix.scale(1.0, 1.0)

    // ViewMatrix 缩放边界（与 Demo 一致）
    this._viewMatrix.setMaxScale(2.0)
    this._viewMatrix.setMinScale(0.8)
    this._viewMatrix.setMaxScreenRect(left * 2, right * 2, bottom * 2, top * 2)

    this._deviceToScreen.loadIdentity()
    // ★ 修正顺序：先 translate 再 scale（与 Cubism SDK Demo 一致）
    // translateRelative 和 scaleRelative 都是左乘，所以先调 translate（它在最左边）
    // 变换链：P' = scale × translate × P → 先平移到原点，再缩放到逻辑坐标
    this._deviceToScreen.translateRelative(-canvasWidth * 0.5, -canvasHeight * 0.5)
    if (canvasWidth > canvasHeight) {
      const screenW = Math.abs(right - left)
      this._deviceToScreen.scaleRelative(screenW / canvasWidth, -screenW / canvasWidth)
    } else {
      const screenH = Math.abs(top - bottom)
      this._deviceToScreen.scaleRelative(screenH / canvasHeight, -screenH / canvasHeight)
    }
  }

  /** 设备坐标 → 逻辑 X 坐标 */
  transformViewX(deviceX: number): number {
    const screenX = this._deviceToScreen.transformX(deviceX)
    return this._viewMatrix.invertTransformX(screenX)
  }

  /** 设备坐标 → 逻辑 Y 坐标 */
  transformViewY(deviceY: number): number {
    const screenY = this._deviceToScreen.transformY(deviceY)
    return this._viewMatrix.invertTransformY(screenY)
  }

  /** 初始化所有效果 Updater，注册到 UpdateScheduler */
  private setupUpdaters(): void {
    this._updateScheduler = new CubismUpdateScheduler()

    // 自动眨眼（官方 create 内部处理一切）
    this._eyeBlink = CubismEyeBlink.create(this._setting)
    this._updateScheduler.addUpdatableList(
      new CubismEyeBlinkUpdater(() => this._motionUpdated, this._eyeBlink)
    )

    // 表情
    this._updateScheduler.addUpdatableList(
      new CubismExpressionUpdater(this._expressionManager)
    )

    // 鼠标注视（官方 Demo: create → setParameters 注册注视参数）
    const look = CubismLook.create()
    this._look = look
    look.setParameters([
      new LookParameterData(CubismFramework.getIdManager().getId('ParamAngleX'), 30.0, 0.0, 0.0),
      new LookParameterData(CubismFramework.getIdManager().getId('ParamAngleY'), 30.0, 0.0, 0.0),
      new LookParameterData(CubismFramework.getIdManager().getId('ParamAngleZ'), 10.0, 0.0, 0.0),
      new LookParameterData(CubismFramework.getIdManager().getId('ParamBodyAngleX'), 10.0, 0.0, 0.0),
      new LookParameterData(CubismFramework.getIdManager().getId('ParamEyeBallX'), 1.0, 0.0, 0.0),
      new LookParameterData(CubismFramework.getIdManager().getId('ParamEyeBallY'), 1.0, 0.0, 0.0),
    ])
    this._updateScheduler.addUpdatableList(
      new CubismLookUpdater(look, this._dragManager)
    )

    // 呼吸（官方 Demo: create → setParameters 注册默认呼吸参数）
    this._breath = CubismBreath.create()
    this._breath.setParameters([
      new BreathParameterData(CubismFramework.getIdManager().getId('ParamAngleX'), 0.0, 15.0, 6.5345, 0.5),
      new BreathParameterData(CubismFramework.getIdManager().getId('ParamAngleY'), 0.0, 8.0, 3.5345, 0.5),
      new BreathParameterData(CubismFramework.getIdManager().getId('ParamAngleZ'), 0.0, 10.0, 5.5345, 0.5),
      new BreathParameterData(CubismFramework.getIdManager().getId('ParamBodyAngleX'), 0.0, 4.0, 15.5345, 0.5),
      new BreathParameterData(CubismFramework.getIdManager().getId('ParamBreath'), 0.5, 0.5, 3.2345, 1.0),
    ])
    this._updateScheduler.addUpdatableList(
      new CubismBreathUpdater(this._breath)
    )

    // 物理演算
    if (this._physics) {
      this._updateScheduler.addUpdatableList(
        new CubismPhysicsUpdater(this._physics)
      )
    }

    // Pose
    if (this._pose) {
      this._updateScheduler.addUpdatableList(
        new CubismPoseUpdater(this._pose)
      )
    }
  }

  /**
   * 从 modelSetting 读取眨眼/唇动参数 ID，并初始化 LipSync Updater
   */
  private setupEffectIds(): void {
    if (!this._setting) return

    // 读取 eyeBlink 参数 ID
    const eyeBlinkCount = this._setting.getEyeBlinkParameterCount()
    for (let i = 0; i < eyeBlinkCount; i++) {
      this._eyeBlinkIds.push(this._setting.getEyeBlinkParameterId(i))
    }

    // 读取 lipSync 参数 ID
    const lipSyncCount = this._setting.getLipSyncParameterCount()
    for (let i = 0; i < lipSyncCount; i++) {
      this._lipSyncIds.push(this._setting.getLipSyncParameterId(i))
    }

    // 使用配置读取的 LipSync ID 初始化 Updater（传入 WAV 音频处理器）
    if (this._lipSyncIds.length > 0) {
      this._lipSyncUpdater = new CubismLipSyncUpdater(this._lipSyncIds, this._wavFileHandler)
      this._updateScheduler?.addUpdatableList(this._lipSyncUpdater)
    }
  }

  /** 预加载所有表情 */
  private async preloadExpressions(): Promise<void> {
    const count = this._setting.getExpressionCount()
    for (let i = 0; i < count; i++) {
      const name = this._setting.getExpressionName(i)
      const file = this._setting.getExpressionFileName(i)
      const path = this._modelDir + file

      try {
        const response = await fetch(path)
        if (!response.ok) continue
        const buffer = await response.arrayBuffer()
        const motion = this.loadExpression(buffer, buffer.byteLength, name)
        if (motion) {
          // ★ 修复：释放旧表情对象（与 Demo 一致，防止内存泄漏）
          const existing = this._expressionCache.get(name)
          if (existing) {
            ACubismMotion.delete(existing)
          }
          this._expressionCache.set(name, motion as unknown as CubismExpressionMotion)
          this._expressionNames.push(name)
        }
      } catch (err) {
        console.warn(`[AppModel] ⚠️ 表情 "${name}" 加载失败:`, err)
      }
    }
  }

  /**
   * 预加载所有动作
   * 加载后调用 setEffectIds 关联眨眼/唇动
   */
  private async preloadMotions(): Promise<void> {
    const groupCount = this._setting.getMotionGroupCount()
    for (let g = 0; g < groupCount; g++) {
      const group = this._setting.getMotionGroupName(g)
      const count = this._setting.getMotionCount(group)
      const names: string[] = []

      for (let i = 0; i < count; i++) {
        const file = this._setting.getMotionFileName(group, i)
        const path = this._modelDir + file
        const name = `${group}_${i}` // 与 Demo 命名规则一致：group_no

        try {
          const response = await fetch(path)
          if (!response.ok) continue
          const buffer = await response.arrayBuffer()

          const motion = this.loadMotion(
            buffer, buffer.byteLength, name,
            undefined, undefined,
            this._setting, group, i,
            true // shouldCheckMotionConsistency（与 Demo 一致）
          )
          if (motion) {
            ;(motion as CubismMotion).setEffectIds(this._eyeBlinkIds, this._lipSyncIds)

            // ★ 修复：释放旧动作对象（与 Demo 一致）
            const existing = this._motionCache.get(name)
            if (existing) {
              ACubismMotion.delete(existing)
            }

            this._motionCache.set(name, motion)
            names.push(name)
          }
        } catch (err) {
          console.warn(`[AppModel] ⚠️ 动作 "${group}/${name}" 加载失败:`, err)
        }
      }

      if (names.length > 0) {
        this._motionGroups.push({ group, names })
      }
    }

    // ★ 新增：动态检测点击动作组（优先 TapBody，不存在则用第一个非 Idle 组）
    const tapCandidate = this._motionGroups.find(g => g.group === 'TapBody')
    if (tapCandidate) {
      this._tapMotionGroup = 'TapBody'
    } else {
      const firstNonIdle = this._motionGroups.find(g => g.group !== 'Idle')
      this._tapMotionGroup = firstNonIdle?.group ?? ''
    }
    console.debug(`[AppModel] 点击动作组: ${this._tapMotionGroup || '(无)'}`)
  }

  /** 应用缩放 */
  private applyScale(scale: number): void {
    const matrix = this.getModelMatrix()
    if (matrix) {
      matrix.scale(scale, scale)
      const arr = matrix.getArray()
      console.debug(`[AppModel] 📐 模型矩阵 (scale=${scale}): [${arr[0].toFixed(4)}, ${arr[5].toFixed(4)}, tx=${arr[12].toFixed(4)}, ty=${arr[13].toFixed(4)}]`)
    }
  }

  /**
   * 切换表情（按官方 Demo 的 startMotion 模式）
   */
  playExpression(name: string): void {
    const motion = this._expressionCache.get(name)
    if (motion) {
      this._expressionManager.startMotion(motion, false)
      this._currentExpression = name
    } else {
      console.warn(`[AppModel] 表情 "${name}" 未找到`)
    }
  }

  /**
   * 播放动作（带优先级系统 + 回调支持 + 声音播放）
   * 按 Cubism 5 官方 Demo 的 startMotion 模式
   */
  playMotion(
    name: string,
    priority: number = PriorityNormal,
    onFinished?: MotionCallback,
    onBegan?: MotionCallback
  ): void {
    const motion = this._motionCache.get(name)
    if (!motion) {
      console.warn(`[AppModel] 动作 "${name}" 未找到`)
      return
    }

    if (!this._motionManager) {
      console.warn('[AppModel] 动作管理器未初始化')
      return
    }

    // 优先级调度逻辑（与官方 Demo startMotion 一致）
    if (priority === PriorityForce) {
      this._motionManager.setReservePriority(priority)
    } else if (!this._motionManager.reserveMotion(priority)) {
      return
    }

    // 设置回调
    if (onFinished) {
      motion.setFinishedMotionHandler(onFinished)
    }
    if (onBegan) {
      motion.setBeganMotionHandler(onBegan)
    }

    // 播放关联声音（与官方 Demo startMotion voice 部分一致）
    this.playMotionSound(name)

    this._motionManager.startMotionPriority(motion, false, priority)
    this._currentMotion = name
  }

  /**
   * 播放动作关联的声音文件
   * @param motionName 动作名称（格式：group_no）
   */
  private playMotionSound(motionName: string): void {
    if (!this._setting) return

    // 解析 group 和 no
    const lastUnderscore = motionName.lastIndexOf('_')
    if (lastUnderscore < 0) return
    const group = motionName.substring(0, lastUnderscore)
    const no = parseInt(motionName.substring(lastUnderscore + 1), 10)
    if (isNaN(no)) return

    const voice = this._setting.getMotionSoundFileName(group, no)
    if (voice && voice !== '') {
      const voicePath = this._modelDir + voice
      this._wavFileHandler.start(voicePath)
    }
  }

  /**
   * 按组随机播放动作（与官方 Demo startRandomMotion 一致）
   */
  startRandomMotion(
    group: string,
    priority: number = PriorityNormal,
    onFinished?: MotionCallback
  ): void {
    const groupInfo = this._motionGroups.find(g => g.group === group)
    if (!groupInfo || groupInfo.names.length === 0) return

    const randomName = groupInfo.names[Math.floor(Math.random() * groupInfo.names.length)]
    this.playMotion(randomName, priority, onFinished)
  }

  /**
   * 设置鼠标拖拽（用于注视效果）
   * @param x 归一化 X 坐标 (-1 ~ 1)
   * @param y 归一化 Y 坐标 (-1 ~ 1)
   * ★ 修复：添加边界限制，防止超出可视范围
   */
  setDragging(x: number, y: number): void {
    // 限制在 -1 到 1 范围内
    const clampedX = Math.max(-1.0, Math.min(1.0, x))
    const clampedY = Math.max(-1.0, Math.min(1.0, y))
    super.setDragging(clampedX, clampedY)
  }

  /**
   * 更新模型（由渲染循环调用）
   * 按 Cubism 5 官方流程：loadParameters → motionManager.updateMotion → saveParameters → updateScheduler → model.update
   * @see Cubism5渲染流程.md 第 2 步
   */
  updateModel(deltaTimeSeconds: number): void {
    const model = this.getModel()
    if (!model) return

    this.setUpdating(true)

    // 加载上次保存的参数状态（官方流程）
    model.loadParameters()

    // 每帧重置动作更新标志（控制眨眼行为）
    this._motionUpdated = false

    // 待机动作循环
    if (this._motionManager && this._motionManager.isFinished()) {
      this.startRandomMotion('Idle', PriorityIdle)
      this._currentMotion = 'Idle'
    } else if (this._motionManager) {
      // 捕获 updateMotion 返回值（与官方 Demo 一致）
      this._motionUpdated = this._motionManager.updateMotion(model, deltaTimeSeconds)
    }

    // 保存当前参数状态（官方流程）
    model.saveParameters()

    // UpdateScheduler 统一调度所有效果（官方流程）
    if (this._updateScheduler) {
      this._updateScheduler.onLateUpdate(model, deltaTimeSeconds)
    }

    // 应用参数到模型（官方流程）
    model.update()

    this.setUpdating(false)
  }

  /**
   * 渲染模型
   * 按 Cubism 5 官方流程：确保 GL 绑定 → setMvpMatrix → drawModel
   * @see Cubism5渲染流程.md 第 4-5 步
   */
  render(gl: WebGLRenderingContext | WebGL2RenderingContext, mvpMatrix: { getArray(): Float32Array }): void {
    const renderer = this.getRenderer()
    if (!renderer) return

    // 确保 GL 绑定（官方流程：startUp 在 loadTextures 之前，这里做兜底）
    if (renderer.gl !== gl) {
      renderer.startUp(gl)
    }

    const model = this.getModel()
    if (!model) return

    renderer.setMvpMatrix(mvpMatrix)
    renderer.drawModel()
  }

  /**
   * ★ 新增：重建渲染器（用于 WebGL 上下文恢复）
   * ★ 修复：改为 async，确保 loadTextures 完成后再返回
   */
  async reloadRenderer(gl?: WebGLRenderingContext | WebGL2RenderingContext): Promise<void> {
    this.deleteRenderer()
    const model = this.getModel()
    const width = model.getCanvasWidth() || 1024
    const height = model.getCanvasHeight() || 1024
    this.createRenderer(width, height)
    if (gl) {
      this.getRenderer().startUp(gl)
      this.getRenderer().setIsPremultipliedAlpha(true)
      this.getRenderer().loadShaders()
    }
    // 重新绑定纹理（★ 修复：await 确保纹理加载完成）
    await this.loadTextures()
  }

  // ============================================================
  // 点击交互 hitTest
  // ============================================================

  /**
   * 命中检测
   * @param hitAreaName 命中区域名称（如 'Head', 'Body'）
   * @param x 逻辑 X 坐标
   * @param y 逻辑 Y 坐标
   */
  hitTest(hitAreaName: string, x: number, y: number): boolean {
    if (this.getOpacity() < 1) return false
    if (!this._setting) return false

    const count = this._setting.getHitAreasCount()
    for (let i = 0; i < count; i++) {
      if (this._setting.getHitAreaName(i) === hitAreaName) {
        const drawId = this._setting.getHitAreaId(i)
        return this.isHit(drawId, x, y)
      }
    }
    return false
  }

  /**
   * 点击事件处理（使用逻辑坐标）
   */
  onTap(x: number, y: number): void {
    if (this.hitTest('Head', x, y)) {
      this.setRandomExpression()
    } else if (this.hitTest('Body', x, y) && this._tapMotionGroup) {
      this.startRandomMotion(this._tapMotionGroup, PriorityNormal)
    }
  }

  /**
   * 随机切换表情
   */
  setRandomExpression(): void {
    if (this._expressionNames.length === 0) return
    const no = Math.floor(Math.random() * this._expressionNames.length)
    this.playExpression(this._expressionNames[no])
  }

  /**
   * 获取动作队列状态
   * ★ 修复：release() 后 _motionManager 为 null，需要保护
   */
  getMotionQueueStatus(): { isFinished: boolean; queueLength: number; currentPriority: number } {
    if (!this._motionManager) {
      return { isFinished: true, queueLength: 0, currentPriority: 0 }
    }
    const entries = this._motionManager.getCubismMotionQueueEntries()
    return {
      isFinished: this._motionManager.isFinished(),
      queueLength: entries ? entries.length : 0,
      currentPriority: this._motionManager.getCurrentPriority()
    }
  }

  /**
   * ★ 新增：切换到麦克风输入（实时 LipSync）
   * @returns 是否成功切换
   */
  async switchToMicrophone(): Promise<boolean> {
    if (!this._microphoneHandler) {
      this._microphoneHandler = new MicrophoneHandler()
    }

    const success = await this._microphoneHandler.start()
    if (success) {
      this._useMicrophone = true
      // 更新 LipSync Updater 的音频源
      if (this._lipSyncUpdater) {
        this._lipSyncUpdater.setAudioProvider(this._microphoneHandler)
      }
    }
    return success
  }

  /**
   * ★ 新增：切换到 WAV 文件输入
   * @param filePath WAV 文件路径
   */
  switchToWavFile(filePath: string): void {
    this._useMicrophone = false
    // 停止麦克风
    if (this._microphoneHandler) {
      this._microphoneHandler.stop()
    }
    // 播放 WAV 文件
    this._wavFileHandler.start(filePath)
    // 更新 LipSync Updater 的音频源
    if (this._lipSyncUpdater) {
      this._lipSyncUpdater.setAudioProvider(this._wavFileHandler)
    }
  }

  /**
   * ★ 新增：停止所有音频输入
   */
  stopAudio(): void {
    this._useMicrophone = false
    if (this._microphoneHandler) {
      this._microphoneHandler.stop()
    }
    // 清除 LipSync 音频源
    if (this._lipSyncUpdater) {
      this._lipSyncUpdater.setAudioProvider(null)
    }
  }

  /**
   * ★ 新增：获取当前音频输入类型
   */
  getAudioInputType(): 'microphone' | 'wav' | 'none' {
    if (this._useMicrophone && this._microphoneHandler?.isRunning) {
      return 'microphone'
    }
    if (this._wavFileHandler) {
      return 'wav'
    }
    return 'none'
  }

  /**
   * 释放资源
   */
  releaseAll(): void {
    if (this._look) {
      CubismLook.delete(this._look)
      this._look = null
    }
    if (this._updateScheduler) {
      this._updateScheduler.release()
      this._updateScheduler = null
    }
    this._eyeBlink = null
    this._breath = null
    this._lipSyncUpdater = null
    this._setting = null
    this._viewMatrix = null
    this._deviceToScreen = null
    // ★ 修复：调用 cleanup 而非直接置 null，确保资源正确释放
    if (this._wavFileHandler) {
      this._wavFileHandler.cleanup()
      this._wavFileHandler = null
    }
    // ★ 新增：停止麦克风输入
    if (this._microphoneHandler) {
      this._microphoneHandler.stop()
      this._microphoneHandler = null
    }
    this._useMicrophone = false
    this._motionCache.clear()
    this._expressionCache.clear()
    this._expressionNames = []
    this._motionGroups = []
    this._eyeBlinkIds = []
    this._lipSyncIds = []

    this.release()
  }
}
