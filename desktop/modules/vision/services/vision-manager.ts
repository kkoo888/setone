import type { Logger } from '../../../src/main/types/logger'
import type { ScopedEventBus } from '../../../src/main/types/event'
import { createHash } from 'crypto'

export interface VisionFrame {
  imageUrl: string
  timestamp: number
  changed: boolean
  analysis?: string
  changeHash?: string
  changeDescription?: string
}

/** 分析模式 */
export type AnalysisMode = 'general' | 'text' | 'code'

/** Ollama API 聊天响应 */
interface OllamaChatResponse {
  model: string
  message: { role: string; content: string }
  done: boolean
}

/** 模式对应的提示词 */
const MODE_PROMPTS: Record<AnalysisMode, string> = {
  general: '请详细描述这张屏幕截图中的内容，包括：1) 主要应用或窗口 2) 可见的UI元素 3) 正在进行的操作 4) 值得注意的信息。简洁明了地描述。',
  text: '请识别图片中的所有文字，按原始布局输出。只输出识别到的文字内容，不要添加任何解释或说明。',
  code: '请识别图片中的代码片段。输出完整的代码内容，保持原始缩进和格式。如果能识别出编程语言，请标注。只输出代码，不要添加解释。'
}

export class VisionManager {
  private logger: Logger
  private isCapturing = false
  private fps = 1
  private intervalId: NodeJS.Timeout | null = null
  private lastFrame: string | null = null
  private lastFrameHash: string | null = null
  private onFrame: ((frame: VisionFrame) => void) | null = null
  private eventBus: ScopedEventBus | null = null
  private ollamaBaseUrl: string
  private visionModel: string

  constructor(
    logger: Logger,
    settings?: {
      defaultFps?: number
      ollamaBaseUrl?: string
      visionModel?: string
    }
  ) {
    this.logger = logger
    this.fps = settings?.defaultFps ?? 1
    this.ollamaBaseUrl = settings?.ollamaBaseUrl ?? 'http://localhost:11434'
    this.visionModel = settings?.visionModel ?? 'qwen2.5-vl'
  }

  /**
   * 绑定事件总线，用于发送画面变化事件
   */
  setEventBus(eventBus: ScopedEventBus): void {
    this.eventBus = eventBus
  }

  /**
   * 开始连续捕获屏幕画面
   * 当检测到画面变化时，通过 onFrame 回调和 eventBus 发送事件
   *
   * @param fps 每秒帧数（0.5~30）
   * @param onFrame 帧回调函数
   */
  startCapture(fps: number, onFrame: (frame: VisionFrame) => void): void {
    if (this.isCapturing) return
    this.fps = Math.max(0.5, Math.min(fps, 30))
    this.onFrame = onFrame
    this.isCapturing = true
    const intervalMs = 1000 / this.fps
    this.intervalId = setInterval(() => this.captureFrame(), intervalMs)
    this.logger.info(`视觉捕获开始: ${this.fps}fps`)
  }

  /**
   * 停止捕获
   */
  stopCapture(): void {
    if (this.intervalId) clearInterval(this.intervalId)
    this.intervalId = null
    this.isCapturing = false
    this.lastFrame = null
    this.lastFrameHash = null
    this.onFrame = null
    this.logger.info('视觉捕获停止')
  }

  /**
   * 捕获单帧画面
   * 使用 base64 hash 进行帧变化检测，比简单字符串比较更高效
   */
  private async captureFrame(): Promise<void> {
    try {
      const { desktopCapturer } = await import('electron')
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 640, height: 360 }
      })
      if (sources.length === 0) return

      const imageUrl = sources[0].thumbnail.toDataURL()
      const currentHash = this.computeHash(imageUrl)
      const changed = this.lastFrameHash !== currentHash
      const changeDescription = changed ? '画面已变化' : undefined

      this.lastFrame = imageUrl
      this.lastFrameHash = currentHash

      const frame: VisionFrame = {
        imageUrl,
        timestamp: Date.now(),
        changed,
        changeHash: currentHash,
        changeDescription
      }

      this.onFrame?.(frame)

      // 通过 eventBus 发送帧变化事件
      if (changed && this.eventBus) {
        this.eventBus.emit('vision:frame-changed', {
          timestamp: frame.timestamp,
          changeHash: currentHash,
          description: changeDescription
        })
      }
    } catch (e) {
      this.logger.error('视觉帧捕获失败', e as Error)
    }
  }

  /**
   * 单次 AI 分析当前画面
   * 调用 Ollama 视觉模型对屏幕截图进行智能分析
   *
   * @param mode 分析模式：general（通用描述）、text（文字识别）、code（代码识别）
   * @returns 包含分析结果的 VisionFrame
   */
  async analyze(mode: AnalysisMode = 'general'): Promise<VisionFrame> {
    const { desktopCapturer } = await import('electron')
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }
    })
    if (sources.length === 0) throw new Error('未找到屏幕源')

    const imageUrl = sources[0].thumbnail.toDataURL()
    const currentHash = this.computeHash(imageUrl)
    const changed = this.lastFrameHash !== currentHash
    this.lastFrame = imageUrl
    this.lastFrameHash = currentHash

    // 调用 AI 分析
    let analysis: string | undefined
    try {
      analysis = await this.analyzeWithOllama(imageUrl, mode)
    } catch (err) {
      this.logger.error('AI 画面分析失败', err as Error)
      analysis = `[分析失败] ${(err as Error).message}`
    }

    return {
      imageUrl,
      timestamp: Date.now(),
      changed,
      analysis,
      changeHash: currentHash
    }
  }

  /**
   * 调用 Ollama 视觉模型进行画面分析
   *
   * @param imageUrl 图片的 data URL
   * @param mode 分析模式
   * @returns 分析结果文本
   */
  private async analyzeWithOllama(imageUrl: string, mode: AnalysisMode): Promise<string> {
    const base64Match = imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
    if (!base64Match) throw new Error('无法提取图片 base64 数据')
    const base64Data = base64Match[1]

    const prompt = MODE_PROMPTS[mode]
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)

    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.visionModel,
          messages: [
            {
              role: 'user',
              content: prompt,
              images: [base64Data]
            }
          ],
          stream: false
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`Ollama API 返回 ${response.status}: ${await response.text()}`)
      }

      const data = (await response.json()) as OllamaChatResponse
      return data.message?.content?.trim() ?? ''
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * 计算图片数据的 SHA-256 哈希
   * 用于高效的帧变化检测，避免存储整帧数据
   *
   * @param data 图片 data URL
   * @returns SHA-256 哈希字符串
   */
  private computeHash(data: string): string {
    return createHash('sha256').update(data).digest('hex')
  }

  /** 是否正在捕获 */
  isActive(): boolean {
    return this.isCapturing
  }

  /** 获取当前帧率 */
  getFps(): number {
    return this.fps
  }

  /** 设置帧率 */
  setFps(fps: number): void {
    this.fps = Math.max(0.5, Math.min(fps, 30))
  }
}
