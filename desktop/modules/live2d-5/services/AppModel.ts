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
import { CubismTargetPoint } from '../lib/math/cubismtargetpoint'
import { CubismRenderer_WebGL } from '../lib/rendering/cubismrenderer_webgl'
import { CubismFramework } from '../lib/live2dcubismframework'
import { CubismDefaultParameterId } from '../lib/cubismdefaultparameterid'
import { CubismIdHandle } from '../lib/id/cubismid'
import { CubismViewMatrix } from '../lib/math/cubismviewmatrix'
import { CubismMatrix44 } from '../lib/math/cubismmatrix44'

// ★ 新增 #14：动作优先级常量
const PriorityNone = 0
const PriorityIdle = 100
const PriorityNormal = 200
const PriorityForce = 300

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

  // ★ 新增 #12：ViewMatrix 逻辑坐标系
  private _viewMatrix: CubismViewMatrix | null = null
  private _deviceToScreen: CubismMatrix44 | null = null

  // 动作预加载缓存
  private _motionCache: Map<string, CubismMotion> = new Map()
  // 表情预加载缓存
  private _expressionCache: Map<string, CubismExpressionMotion> = new Map()

  // 表情/动作列表（对外暴露）
  private _expressionNames: string[] = []
  private _motionGroups: Array<{ group: string; names: string[] }> = []

  // ★ 新增 #3：眨眼/唇动参数 ID 列表
  private _eyeBlinkIds: CubismIdHandle[] = []
  private _lipSyncIds: CubismIdHandle[] = []

  /** 表情名称列表 */
  get expressionNames(): string[] {
    return this._expressionNames
  }

  /** 动作分组列表 */
  get motionGroups(): Array<{ group: string; names: string[] }> {
    return this._motionGroups
  }

  /**
   * 加载模型资源（SDK 标准流程）
   *
   * @param model3Path model3.json 的完整路径
   * @param scale 缩放比例（默认 0.15）
   */
  async loadAssets(model3Path: string, scale: number = 0.15): Promise<void> {
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

    // 3. 加载 .moc3 → 创建模型（CubismUserModel.loadModel）
    await this.loadMoc()

    // 4. ★ 新增 #13：读取 Layout 配置
    this.setupLayout()

    // 5. 加载纹理
    await this.loadTextures()

    // 6. 加载物理演算
    await this.loadPhysicsData()

    // 7. 加载 Pose
    await this.loadPoseData()

    // 8. 创建渲染器（CubismUserModel.createRenderer）
    this.setupRenderer()

    // 9. ★ 新增 #12：初始化 ViewMatrix
    const model = this.getModel()
    const canvasW = model.getCanvasWidth() || 1024
    const canvasH = model.getCanvasHeight() || 1024
    this.setupViewMatrix(canvasW, canvasH)

    // 10. 初始化所有效果 Updater
    this.setupUpdaters()

    // 11. ★ 新增 #3：读取眨眼/唇动参数 ID
    this.setupEffectIds()

    // 12. 预加载表情
    await this.preloadExpressions()

    // 13. 预加载动作
    await this.preloadMotions()

    // 14. 应用缩放
    this.applyScale(scale)

    // 15. 标记初始化完成
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

    // ★ 修复 #9：启用 mocConsistency 检查
    this.loadModel(buffer, true)
  }

  /**
   * ★ 新增 #13：从 modelSetting 读取 Layout 配置并应用到模型矩阵
   */
  private setupLayout(): void {
    if (!this._setting) return
    const layout = new Map<string, number>()
    this._setting.getLayoutMap(layout)
    if (layout.size > 0) {
      const modelMatrix = this.getModelMatrix()
      if (modelMatrix) {
        modelMatrix.setupFromLayout(layout)
      }
    }
  }

  /** 加载纹理 */
  private async loadTextures(): Promise<void> {
    const count = this._setting.getTextureCount()
    for (let i = 0; i < count; i++) {
      const texFile = this._setting.getTextureFileName(i)
      const texPath = this._modelDir + texFile

      const texture = await this.loadTextureImage(texPath)
      if (texture) {
        this.getRenderer().bindTexture(i, texture)
      }
    }
  }

  /** 加载单个纹理图片 → WebGLTexture */
  private loadTextureImage(url: string): Promise<WebGLTexture | null> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const gl = (this.getRenderer() as any)._gl as WebGLRenderingContext
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

    // CubismUserModel.loadPhysics
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

    // CubismUserModel.loadPose
    this.loadPose(buffer, buffer.byteLength)
  }

  /** 创建渲染器（CubismUserModel.createRenderer） */
  private setupRenderer(): void {
    // 内部会调用 new CubismRenderer_WebGL(w, h) + initialize(model)
    // 注意：这里先不传 gl，后续由 service 层调用 startUp(gl)
    const model = this.getModel()
    const width = model.getCanvasWidth() || 1024
    const height = model.getCanvasHeight() || 1024
    this.createRenderer(width, height)
  }

  /**
   * ★ 新增 #12：初始化 ViewMatrix 逻辑坐标系
   * 用于设备坐标 → 模型空间坐标的变换
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

    this._deviceToScreen.loadIdentity()
    if (canvasWidth > canvasHeight) {
      const screenW = Math.abs(right - left)
      this._deviceToScreen.scaleRelative(screenW / canvasWidth, -screenW / canvasWidth)
    } else {
      const screenH = Math.abs(top - bottom)
      this._deviceToScreen.scaleRelative(screenH / canvasHeight, -screenH / canvasHeight)
    }
    this._deviceToScreen.translateRelative(-canvasWidth * 0.5, -canvasHeight * 0.5)
  }

  /**
   * ★ 新增 #12：设备坐标 → 逻辑 X 坐标
   */
  transformViewX(deviceX: number): number {
    const screenX = this._deviceToScreen.transformX(deviceX)
    return this._viewMatrix.invertTransformX(screenX)
  }

  /**
   * ★ 新增 #12：设备坐标 → 逻辑 Y 坐标
   */
  transformViewY(deviceY: number): number {
    const screenY = this._deviceToScreen.transformY(deviceY)
    return this._viewMatrix.invertTransformY(screenY)
  }

  /** 初始化所有效果 Updater，注册到 UpdateScheduler */
  private setupUpdaters(): void {
    this._updateScheduler = new CubismUpdateScheduler()

    // 自动眨眼
    this._eyeBlink = CubismEyeBlink.create(this._setting)
    this._updateScheduler.addUpdatableList(
      new CubismEyeBlinkUpdater(() => this.isUpdating(), this._eyeBlink)
    )

    // 表情
    this._updateScheduler.addUpdatableList(
      new CubismExpressionUpdater(this._expressionManager)
    )

    // ★ 修复 #1：鼠标注视 + 配置 LookParameterData
    const look = CubismLook.create()
    const idManager = CubismFramework.getIdManager()
    look.setParameters([
      new LookParameterData(idManager.getId('ParamAngleX'), 30.0, 0.0, 0.0),
      new LookParameterData(idManager.getId('ParamAngleY'), 0.0, 30.0, 0.0),
      new LookParameterData(idManager.getId('ParamAngleZ'), 0.0, 0.0, -30.0),
      new LookParameterData(idManager.getId('ParamBodyAngleX'), 10.0, 0.0, 0.0),
      new LookParameterData(idManager.getId(CubismDefaultParameterId.ParamEyeBallX), 1.0, 0.0, 0.0),
      new LookParameterData(idManager.getId(CubismDefaultParameterId.ParamEyeBallY), 0.0, 1.0, 0.0),
    ])
    this._look = look
    this._updateScheduler.addUpdatableList(
      new CubismLookUpdater(this._look, this._dragManager)
    )

    // ★ 修复 #2：呼吸参数值修正（peak 从 0.01 改为 Demo 值）
    this._breath = CubismBreath.create()
    this._breath.setParameters([
      new BreathParameterData(idManager.getId('ParamAngleX'), 0.0, 15.0, 6.5345, 0.5),
      new BreathParameterData(idManager.getId('ParamAngleY'), 0.0, 8.0, 3.5345, 0.5),
      new BreathParameterData(idManager.getId('ParamAngleZ'), 0.0, 10.0, 5.5345, 0.5),
      new BreathParameterData(idManager.getId('ParamBodyAngleX'), 0.0, 4.0, 15.5345, 0.5),
      new BreathParameterData(idManager.getId(CubismDefaultParameterId.ParamBreath), 0.5, 0.5, 3.2345, 1),
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

    // ★ 修复 #5：LipSync 初始化延迟到 setupEffectIds() 之后

    // Pose
    if (this._pose) {
      this._updateScheduler.addUpdatableList(
        new CubismPoseUpdater(this._pose)
      )
    }
  }

  /**
   * ★ 新增 #3/#5：从 modelSetting 读取眨眼/唇动参数 ID，并初始化 LipSync Updater
   */
  private setupEffectIds(): void {
    if (!this._setting) return

    const idManager = CubismFramework.getIdManager()

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

    // ★ 修复 #5：使用配置读取的 LipSync ID 初始化 Updater
    if (this._lipSyncIds.length > 0) {
      this._lipSyncUpdater = new CubismLipSyncUpdater(this._lipSyncIds, null)
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
   * ★ 修复 #3：加载后调用 setEffectIds 关联眨眼/唇动
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
        const name = file.split('/').pop()?.replace('.motion3.json', '') ?? `${group}_${i}`

        try {
          const response = await fetch(path)
          if (!response.ok) continue
          const buffer = await response.arrayBuffer()

          // 使用 CubismUserModel.loadMotion（支持 fadeIn/fadeOut 配置）
          const motion = this.loadMotion(
            buffer, buffer.byteLength, name,
            undefined, undefined,
            this._setting, group, i
          )
          if (motion) {
            // ★ 修复 #3：关联眨眼/唇动参数 ID
            ;(motion as CubismMotion).setEffectIds(this._eyeBlinkIds, this._lipSyncIds)
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
  }

  /** 应用缩放 */
  private applyScale(scale: number): void {
    const matrix = this.getModelMatrix()
    if (matrix) {
      matrix.scale(scale, scale)
    }
  }

  /**
   * 切换表情
   * @param name 表情名称
   */
  playExpression(name: string): void {
    const motion = this._expressionCache.get(name)
    if (motion) {
      this._expressionManager.startMotion(motion, false)
    } else {
      console.warn(`[AppModel] 表情 "${name}" 未找到`)
    }
  }

  /**
   * ★ 修复 #14：播放动作（带优先级系统）
   * @param name 动作名称
   * @param priority 优先级（默认 PriorityNormal = 200）
   */
  playMotion(name: string, priority: number = PriorityNormal): void {
    const motion = this._motionCache.get(name)
    if (!motion) {
      console.warn(`[AppModel] 动作 "${name}" 未找到`)
      return
    }

    // 优先级调度逻辑
    if (priority === PriorityForce) {
      this._motionManager.setReservePriority(priority)
    } else if (!this._motionManager.reserveMotion(priority)) {
      return
    }

    this._motionManager.startMotionPriority(motion, false, priority)
  }

  /**
   * 设置鼠标拖拽（用于注视效果）
   * @param x 归一化 X 坐标 (-1 ~ 1)
   * @param y 归一化 Y 坐标 (-1 ~ 1)
   */
  setDragging(x: number, y: number): void {
    super.setDragging(x, y)
  }

  /**
   * ★ 修复 #4/#6：更新模型（由渲染循环调用）
   * - loadParameters / saveParameters 包裹参数状态
   * - 动作播完后自动播放待机动作
   */
  updateModel(deltaTimeSeconds: number): void {
    const model = this.getModel()
    if (!model) return

    this.setUpdating(true)

    // ★ 修复 #4：加载上次保存的参数状态
    model.loadParameters()

    // ★ 修复 #6：待机动作循环
    if (this._motionManager.isFinished()) {
      // 尝试播放待机动作（PriorityIdle = 100）
      const idleGroup = this._motionGroups.find(g => g.group === 'Idle' || g.group === 'idle')
      if (idleGroup && idleGroup.names.length > 0) {
        const randomName = idleGroup.names[Math.floor(Math.random() * idleGroup.names.length)]
        this.playMotion(randomName, PriorityIdle)
      }
    } else {
      this._motionManager.updateMotion(model, deltaTimeSeconds)
    }

    // ★ 修复 #4：保存当前参数状态
    model.saveParameters()

    // UpdateScheduler 统一调度所有效果
    if (this._updateScheduler) {
      this._updateScheduler.onLateUpdate(model, deltaTimeSeconds)
    }

    model.update()

    this.setUpdating(false)
  }

  /**
   * 渲染模型
   * @param gl WebGL 上下文
   * @param mvpMatrix MVP 矩阵
   */
  render(gl: WebGLRenderingContext | WebGL2RenderingContext, mvpMatrix: { getArray(): Float32Array }): void {
    const renderer = this.getRenderer()
    if (!renderer) return

    // startUp 必须在每次渲染前调用（或至少调用一次）
    renderer.startUp(gl)
    renderer.setMvpMatrix(mvpMatrix)
    renderer.drawModel()
  }

  // ============================================================
  // ★ 新增 #7：点击交互 hitTest
  // ============================================================

  /**
   * 命中检测
   * @param hitAreaName 命中区域名称（如 'Head', 'Body'）
   * @param x 逻辑 X 坐标（设备坐标已通过 transformViewX 转换）
   * @param y 逻辑 Y 坐标（设备坐标已通过 transformViewY 转换）
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
   * @param x 逻辑 X 坐标（应先通过 transformViewX 转换）
   * @param y 逻辑 Y 坐标（应先通过 transformViewY 转换）
   */
  onTap(x: number, y: number): void {
    if (this.hitTest('Head', x, y)) {
      this.setRandomExpression()
    } else if (this.hitTest('Body', x, y)) {
      const tapBodyGroup = this._motionGroups.find(g => g.group === 'TapBody' || g.group === 'tap_body')
      if (tapBodyGroup && tapBodyGroup.names.length > 0) {
        const randomName = tapBodyGroup.names[Math.floor(Math.random() * tapBodyGroup.names.length)]
        // ★ 修复 #14：点击动作用 PriorityNormal
        this.playMotion(randomName, PriorityNormal)
      }
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
   * 释放资源
   */
  releaseAll(): void {
    if (this._updateScheduler) {
      this._updateScheduler.release()
      this._updateScheduler = null
    }
    this._eyeBlink = null
    this._breath = null
    this._look = null
    this._lipSyncUpdater = null
    this._setting = null
    this._viewMatrix = null
    this._deviceToScreen = null
    this._motionCache.clear()
    this._expressionCache.clear()
    this._expressionNames = []
    this._motionGroups = []
    this._eyeBlinkIds = []
    this._lipSyncIds = []

    // CubismUserModel.release()
    this.release()
  }
}
