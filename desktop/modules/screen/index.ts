// 补完内容：OCR 功能实现（调用 Ollama qwen2.5-vl 视觉模型）、批量 OCR（recognizeBatch）
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { ScreenCaptureService } from './services/screen-capture'
import { OcrService } from './services/ocr'

export default class ScreenModule implements Module {
  id = 'screen'
  meta!: import('../../src/main/types/module').ModuleMeta
  private capture!: ScreenCaptureService
  private ocr!: OcrService
  private context!: ModuleContext

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.capture = new ScreenCaptureService(context.logger)

    const settings = context.config?.settings as Record<string, unknown> | undefined
    this.ocr = new OcrService(context.logger, {
      ollamaBaseUrl: settings?.ollamaBaseUrl as string | undefined,
      visionModel: settings?.visionModel as string | undefined
    })

    context.logger.info('屏幕理解模块已激活（Ollama OCR）')
  }

  async deactivate(): Promise<void> {
    this.context.logger.info('屏幕理解模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool',
        name: 'screen_capture',
        description: '截取屏幕',
        priority: 10,
        moduleId: this.id,
        handler: { execute: async () => this.capture.captureScreen() }
      },
      {
        type: 'tool',
        name: 'screen_ocr',
        description: 'OCR 文字识别（调用 Ollama 视觉模型）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { imageUrl } = p as { imageUrl?: string }
            return imageUrl ? this.ocr.recognize(imageUrl) : this.ocr.recognizeScreen()
          }
        }
      },
      {
        type: 'tool',
        name: 'screen_ocr_batch',
        description: '批量 OCR 文字识别',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { imageUrls } = p as { imageUrls: string[] }
            return this.ocr.recognizeBatch(imageUrls)
          }
        }
      }
    ]
  }
}
