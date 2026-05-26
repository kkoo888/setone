/**
 * Live2D Cubism 5 渲染测试入口
 * 导入模块代码并暴露到 window，供 Playwright 测试调用
 */

// 导入 Cubism Framework
import { CubismFramework } from '../../modules/live2d-5/lib/live2dcubismframework'
import { CubismMatrix44 } from '../../modules/live2d-5/lib/math/cubismmatrix44'

// 导入 AppModel（核心模型类）
import { AppModel } from '../../modules/live2d-5/services/AppModel'

// 导入 Shader Manager（检查 shader 加载状态）
import { CubismShaderManager_WebGL } from '../../modules/live2d-5/lib/rendering/cubismshader_webgl'

// 暴露到 window 供 Playwright 调用
declare global {
  interface Window {
    Live2D5Test: {
      CubismFramework: typeof CubismFramework
      CubismMatrix44: typeof CubismMatrix44
      AppModel: typeof AppModel
      CubismShaderManager_WebGL: typeof CubismShaderManager_WebGL
      initFramework: () => void
      loadModel: (modelPath: string, scale?: number) => Promise<any>
      renderFrame: (gl: WebGLRenderingContext | WebGL2RenderingContext, canvas: HTMLCanvasElement, model: any) => void
      checkPixels: (gl: WebGLRenderingContext | WebGL2RenderingContext, x: number, y: number, w: number, h: number) => Uint8Array
    }
  }
}

window.Live2D5Test = {
  CubismFramework,
  CubismMatrix44,
  AppModel,
  CubismShaderManager_WebGL,

  /** 初始化 Cubism Framework */
  initFramework() {
    if (CubismFramework.startUp) CubismFramework.startUp()
    if (CubismFramework.initialize) CubismFramework.initialize()
    console.log('[Test] ✅ Cubism Framework 已初始化')
  },

  /**
   * 加载模型（使用 AppModel 标准流程）
   * 与 cubism5-service.ts 的 loadModel 逻辑一致
   */
  async loadModel(modelPath: string, scale: number = 0.85) {
    const gl = (window as any).__testGl as WebGLRenderingContext | WebGL2RenderingContext
    if (!gl) throw new Error('GL 上下文未初始化，请先调用 initGL()')

    const appModel = new AppModel()
    await appModel.loadAssets(modelPath, scale, gl)

    // ★ 关键：设置 renderer 的 offscreen render target 尺寸为 canvas 实际像素尺寸
    // 与 cubism5-service.ts loadModel 中的 setRenderState 调用一致
    const canvas = document.getElementById('canvas') as HTMLCanvasElement
    const renderer = appModel.getRenderer()
    if (renderer && canvas) {
      renderer.setRenderState(null, [0, 0, canvas.width, canvas.height])
    }

    console.log('[Test] ✅ 模型加载完成')
    return appModel
  },

  /**
   * 渲染一帧（与 cubism5-service.ts renderFrame 一致）
   */
  renderFrame(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
    model: any // AppModel
  ) {
    // ① 清除画布
    gl.clearColor(0.0, 0.0, 0.0, 0.0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    // ② 更新模型（deltaTime = 0.016 ≈ 60fps）
    model.updateModel(0.016)

    // ③ 创建 MVP 矩阵（与 cubism5-service createMvpMatrix 一致）
    const modelMatrix = model.getModelMatrix()
    const viewMatrix = model.getViewMatrix()

    const projection = new CubismMatrix44()
    if (canvas.width > canvas.height) {
      projection.scale(canvas.height / canvas.width, 1.0)
    } else {
      projection.scale(1.0, canvas.width / canvas.height)
    }

    // 构建 MVP：projection × view × model
    const a = projection.getArray()
    const tmp = new Float32Array(16)
    const tmp2 = new Float32Array(16)

    if (viewMatrix) {
      CubismMatrix44.multiply(a, viewMatrix.getArray(), tmp)
    } else {
      tmp.set(a)
    }
    if (modelMatrix) {
      CubismMatrix44.multiply(tmp, modelMatrix.getArray(), tmp2)
    } else {
      tmp2.set(tmp)
    }

    const mvp = new CubismMatrix44()
    mvp.setMatrix(tmp2)
    const mvpObj = { getArray: () => mvp.getArray() }

    // ④ 渲染
    model.render(gl, mvpObj)
  },

  /**
   * 读取像素（用于验证渲染结果）
   */
  checkPixels(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    x: number, y: number, w: number, h: number
  ): Uint8Array {
    const pixels = new Uint8Array(w * h * 4)
    gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    return pixels
  },

  /**
   * 等待 shader 加载完成
   */
  async waitForShaders(timeoutMs = 15000): Promise<boolean> {
    const start = Date.now()
    while (true) {
      try {
        const shader = CubismShaderManager_WebGL.getInstance().getShader((window as any).__testGl)
        if (shader?._isShaderLoaded) {
          console.log('[Test] ✅ shader 加载完成')
          return true
        }
      } catch {}
      if (Date.now() - start > timeoutMs) {
        console.error('[Test] ⏰ shader 等待超时')
        return false
      }
      await new Promise(r => setTimeout(r, 100))
    }
  },
}

console.log('[Test] 🚀 Live2D5Test 入口已加载')
