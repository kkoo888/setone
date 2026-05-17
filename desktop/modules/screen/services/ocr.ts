import type { Logger } from '../../../src/main/types/logger'

export interface OcrResult {
  text: string
  confidence: number
  regions: Array<{ text: string; x: number; y: number; width: number; height: number }>
}

/** Ollama API 聊天响应 */
interface OllamaChatResponse {
  model: string
  message: { role: string; content: string }
  done: boolean
}

export class OcrService {
  private logger: Logger
  private ollamaBaseUrl: string
  private visionModel: string

  constructor(logger: Logger, options?: { ollamaBaseUrl?: string; visionModel?: string }) {
    this.logger = logger
    this.ollamaBaseUrl = options?.ollamaBaseUrl ?? 'http://localhost:11434'
    this.visionModel = options?.visionModel ?? 'qwen2.5-vl'
  }

  /**
   * 从图片数据 URL 中识别文字
   * 调用 Ollama 视觉模型（qwen2.5-vl）进行 OCR
   *
   * @param imageDataUrl 图片的 data URL（data:image/xxx;base64,...）
   * @returns OCR 识别结果，包含文本、置信度和区域信息
   */
  async recognize(imageDataUrl: string): Promise<OcrResult> {
    this.logger.info('OCR 识别开始（Ollama 视觉模型）')

    try {
      // 提取 base64 数据
      const base64Data = this.extractBase64(imageDataUrl)
      if (!base64Data) {
        throw new Error('无法从图片数据中提取 base64 内容')
      }

      const result = await this.callOllamaVision(base64Data, '请识别图片中的所有文字，按原始布局输出。只输出识别到的文字内容，不要添加任何解释或说明。')

      // 从 AI 响应中解析结构化结果
      const text = result.trim()
      const confidence = this.estimateConfidence(text)

      this.logger.info(`OCR 识别完成: ${text.length} 字符, 置信度 ${confidence.toFixed(2)}`)

      return {
        text,
        confidence,
        regions: this.parseRegions(text)
      }
    } catch (err) {
      this.logger.error('OCR 识别失败', err as Error)
      return { text: '', confidence: 0, regions: [] }
    }
  }

  /**
   * 从屏幕截图中识别文字
   * 先截取屏幕，再调用 OCR
   */
  async recognizeScreen(): Promise<OcrResult> {
    const { ScreenCaptureService } = await import('./screen-capture')
    const capture = new ScreenCaptureService(this.logger)
    const result = await capture.captureScreen()
    return this.recognize(result.imageUrl)
  }

  /**
   * 批量 OCR 识别
   * 对多张图片依次进行文字识别
   *
   * @param imageDataUrls 图片 data URL 数组
   * @returns 每张图片的 OCR 结果数组
   */
  async recognizeBatch(imageDataUrls: string[]): Promise<OcrResult[]> {
    this.logger.info(`批量 OCR 识别: ${imageDataUrls.length} 张图片`)
    const results: OcrResult[] = []

    for (let i = 0; i < imageDataUrls.length; i++) {
      this.logger.info(`批量 OCR 进度: ${i + 1}/${imageDataUrls.length}`)
      const result = await this.recognize(imageDataUrls[i])
      results.push(result)
    }

    this.logger.info(`批量 OCR 完成: ${results.length} 张图片已处理`)
    return results
  }

  /**
   * 调用 Ollama 视觉模型
   *
   * @param base64Data 图片的 base64 编码数据
   * @param prompt 提示词
   * @returns 模型返回的文本内容
   */
  private async callOllamaVision(base64Data: string, prompt: string): Promise<string> {
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
      return data.message?.content ?? ''
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * 从 data URL 中提取 base64 数据
   * 去除 data:image/xxx;base64, 前缀
   */
  private extractBase64(dataUrl: string): string | null {
    const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
    return match ? match[1] : null
  }

  /**
   * 根据识别文本长度和质量估算置信度
   */
  private estimateConfidence(text: string): number {
    if (!text || text.length === 0) return 0
    // 基于文本特征的简单置信度估算
    const hasChineseChars = /[\u4e00-\u9fff]/.test(text)
    const hasEnglishChars = /[a-zA-Z]/.test(text)
    const hasNumbers = /[0-9]/.test(text)
    const totalChars = text.length

    let confidence = 0.5 // 基础置信度
    if (totalChars > 10) confidence += 0.1
    if (totalChars > 50) confidence += 0.1
    if (hasChineseChars || hasEnglishChars) confidence += 0.15
    if (hasNumbers) confidence += 0.05
    // 纯空白或乱码降低置信度
    if (/^\s*$/.test(text)) confidence = 0
    return Math.min(confidence, 0.95)
  }

  /**
   * 从纯文本中解析文本区域
   * 按行拆分，估算每行的位置信息
   */
  private parseRegions(text: string): Array<{ text: string; x: number; y: number; width: number; height: number }> {
    if (!text) return []

    const lines = text.split('\n').filter((line) => line.trim().length > 0)
    return lines.map((line, index) => ({
      text: line.trim(),
      x: 0,
      y: index * 24, // 按行高 24px 估算
      width: line.trim().length * 12, // 按字符宽 12px 估算
      height: 24
    }))
  }
}
