// 补完内容：AI 画面分析（Ollama 视觉模型）、帧变化检测（SHA-256 hash）、分析模式（general/text/code）、事件增强
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { VisionManager } from './services/vision-manager'
import type { AnalysisMode } from './services/vision-manager'

export default class VisionModule implements Module {
  id = 'vision'
  meta!: import('../../src/main/types/module').ModuleMeta
  private manager!: VisionManager
  private context!: ModuleContext

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    const settings = context.config?.settings as Record<string, unknown> | undefined
    this.manager = new VisionManager(context.logger, {
      defaultFps: settings?.defaultFps as number | undefined,
      ollamaBaseUrl: settings?.ollamaBaseUrl as string | undefined,
      visionModel: settings?.visionModel as string | undefined
    })

    // 绑定事件总线用于发送帧变化事件
    this.manager.setEventBus(context.eventBus)

    context.logger.info('视觉感知模块已激活（AI 分析 + 帧变化检测 + 分析模式）')
  }

  async deactivate(): Promise<void> {
    this.manager.stopCapture()
    this.context.logger.info('视觉感知模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool',
        name: 'vision_start',
        description: '开始视觉捕获（支持帧率设置）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { fps } = p as { fps?: number }
            this.manager.startCapture(fps ?? 1, (frame) => {
              this.context.eventBus.emit('vision:frame', frame)
            })
            return { capturing: true, fps: this.manager.getFps() }
          }
        }
      },
      {
        type: 'tool',
        name: 'vision_stop',
        description: '停止视觉捕获',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async () => {
            this.manager.stopCapture()
            return { capturing: false }
          }
        }
      },
      {
        type: 'tool',
        name: 'vision_analyze',
        description: 'AI 分析当前画面（支持 general/text/code 模式）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { mode } = p as { mode?: AnalysisMode }
            return this.manager.analyze(mode ?? 'general')
          }
        }
      }
    ]
  }
}
