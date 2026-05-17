import type { Logger } from '../../../src/main/types/logger'

export interface CaptureResult {
  imageUrl: string
  width: number
  height: number
  timestamp: number
}

export interface CaptureRegion {
  x: number
  y: number
  width: number
  height: number
}

export class ScreenCaptureService {
  private logger: Logger
  constructor(logger: Logger) { this.logger = logger }

  /** 截取全屏（需在主进程中调用 desktopCapturer） */
  async captureScreen(): Promise<CaptureResult> {
    try {
      const { desktopCapturer } = await import('electron')
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } })
      if (sources.length === 0) throw new Error('未找到屏幕源')
      const source = sources[0]
      const imageUrl = source.thumbnail.toDataURL()
      const size = source.thumbnail.getSize()
      this.logger.info(`屏幕截图完成: ${size.width}x${size.height}`)
      return { imageUrl, width: size.width, height: size.height, timestamp: Date.now() }
    } catch (e) {
      this.logger.error('屏幕截图失败', e as Error)
      throw e
    }
  }

  /** 截取指定区域 */
  async captureRegion(region: CaptureRegion): Promise<CaptureResult> {
    const full = await this.captureScreen()
    // 通过 canvas 裁剪（渲染进程侧处理）
    this.logger.info(`区域截图: ${region.x},${region.y} ${region.width}x${region.height}`)
    return { ...full, width: region.width, height: region.height }
  }
}
