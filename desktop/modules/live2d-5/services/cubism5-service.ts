/**
 * Cubism 5 SDK Service
 * 独立加载 Cubism 5 Core + Framework，不依赖 window.Live2DCubismCore
 * 完全与旧版 Cubism 4 隔离
 */

/** Cubism 5 模型配置 */
export interface Cubism5ModelConfig {
  name: string
  modelPath: string
  scale?: number
  offsetX?: number
  offsetY?: number
}

/** 模型状态 */
export type Cubism5ModelState = 'idle' | 'loading' | 'loaded' | 'error'

/** 状态回调 */
type StateCallback = (state: Cubism5ModelState) => void

/**
 * Cubism 5 Service（单例）
 * 在独立 renderer 进程中运行，使用 Cubism 5 SDK
 */
class Cubism5Service {
  private state: Cubism5ModelState = 'idle'
  private onStateChange: StateCallback | null = null
  private sdkLoaded = false
  private model: unknown = null

  /** 注册状态回调 */
  setStateCallback(cb: StateCallback | null): void {
    this.onStateChange = cb
  }

  /** 获取当前状态 */
  getState(): Cubism5ModelState {
    return this.state
  }

  /**
   * 加载 Cubism 5 Core SDK
   * 使用动态 script 注入，作用域隔离在当前 renderer 进程
   */
  async loadSDK(): Promise<void> {
    if (this.sdkLoaded) return

    this.updateState('loading')

    try {
      // 检查是否已有 Cubism 5 Core（可能被其他脚本加载）
      const win = window as unknown as Record<string, unknown>
      if (win.Live2DCubismCore) {
        console.log('[Cubism5] Core SDK 已存在')
        this.sdkLoaded = true
        this.updateState('idle')
        return
      }

      // 动态加载 Cubism 5 Core SDK
      // 路径指向本模块的 lib 目录（独立于旧 SDK）
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        // ⚠️ 用户需要将 Cubism 5 Core SDK 放到此路径
        script.src = '/modules/live2d-5/lib/live2dcubismcore.min.js'
        script.onload = () => {
          console.log('[Cubism5] ✅ Core SDK 加载成功')
          this.sdkLoaded = true
          resolve()
        }
        script.onerror = () => {
          reject(new Error('Cubism 5 Core SDK 加载失败，请确认文件存在于 /modules/live2d-5/lib/'))
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
   * 加载 Live2D 模型
   * 使用 Cubism 5 Framework（本模块 lib/ 下的源码）
   */
  async loadModel(config: Cubism5ModelConfig, container: HTMLElement): Promise<void> {
    if (!this.sdkLoaded) {
      await this.loadSDK()
    }

    this.updateState('loading')

    try {
      // 动态导入 Cubism 5 Framework
      const framework = await import('../lib/live2dcubismframework')
      const CubismFramework = framework.Live2DCubismFramework ?? framework.default

      // 初始化 Framework
      if (CubismFramework && CubismFramework.startUp) {
        CubismFramework.startUp()
        CubismFramework.initialize()
      }

      // 动态导入 pixi.js（最新版）
      const PIXI = await import('pixi.js')
      ;(window as unknown as Record<string, unknown>).PIXI = PIXI

      // 动态导入 pixi-live2d-display（支持 Cubism 5 的版本）
      const live2dModule = await import('pixi-live2d-display/cubism4')
      const Live2DModel = live2dModule.Live2DModel

      if (!Live2DModel?.from) {
        throw new Error('pixi-live2d-display 导入失败：Live2DModel.from 不可用')
      }

      // 创建 PIXI Application
      const app = new PIXI.Application({
        width: container.clientWidth,
        height: container.clientHeight,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })

      const canvas = (app as any).canvas ?? (app as any).view
      if (container && canvas) {
        container.appendChild(canvas)
      }

      // 加载模型
      this.model = await Live2DModel.from(config.modelPath, {
        autoHitTest: true,
        autoFocus: true,
      })

      const model = this.model as any
      model.anchor.set(config.offsetX ?? 0.5, config.offsetY ?? 0.5)
      model.scale.set(config.scale ?? 0.15, config.scale ?? 0.15)
      model.x = app.renderer.width / 2
      model.y = app.renderer.height / 2
      app.stage.addChild(model)

      this.updateState('loaded')
      console.log('[Cubism5] ✅ 模型加载完成:', config.name)
    } catch (err) {
      console.error('[Cubism5] ❌ 模型加载失败:', err)
      this.updateState('error')
      throw err
    }
  }

  /** 切换表情 */
  async setExpression(expressionId: string): Promise<void> {
    const model = this.model as any
    if (model?.internalModel?.motionManager?.expressionManager) {
      model.internalModel.motionManager.expressionManager.setExpression(expressionId)
    }
  }

  /** 播放动作 */
  async playMotion(motionId: string): Promise<void> {
    const model = this.model as any
    if (model?.internalModel?.motionManager?.startMotion) {
      const parts = motionId.split(':')
      const group = parts[0] ?? motionId
      const index = parseInt(parts[1] ?? '0', 10)
      model.internalModel.motionManager.startMotion(group, index, 3)
    }
  }

  /** 销毁 */
  destroy(): void {
    const model = this.model as any
    if (model?.destroy) {
      model.destroy()
    }
    this.model = null
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
