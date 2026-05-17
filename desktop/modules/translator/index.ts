import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { TranslatorSettings } from './types'
import { TranslationEngine } from './services/TranslationEngine'
import { LanguageDetector } from './services/LanguageDetector'
import { TranslationHistory } from './services/TranslationHistory'

/**
 * 翻译面板模块
 * 文本翻译、语言检测、翻译历史管理、收藏功能
 */
export default class TranslatorModule implements Module {
  id = 'translator'
  meta!: import('../../src/main/types/module').ModuleMeta

  private context!: ModuleContext
  private engine!: TranslationEngine
  private detector!: LanguageDetector
  private history!: TranslationHistory

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    const settings = context.config as unknown as TranslatorSettings

    // 初始化翻译引擎
    this.engine = new TranslationEngine(context.ai, context.logger)

    // 初始化语言检测器
    this.detector = new LanguageDetector()

    // 初始化历史存储
    this.history = new TranslationHistory(context.db, context.logger, settings.maxHistory ?? 200)
    await this.history.init()

    context.logger.info('翻译面板模块已激活')
  }

  async deactivate(): Promise<void> {
    // 清理 DB 引用
    this.history = undefined as never
    this.context.logger.info('翻译面板模块已停用')
  }

  getCapabilities(): Capability[] {
    const settings = this.context?.config as unknown as TranslatorSettings

    return [
      // --- 翻译文本 ---
      {
        type: 'tool',
        name: 'translate_text',
        description: '翻译文本',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { text, sourceLang, targetLang } = p as {
              text: string; sourceLang?: string; targetLang?: string
            }
            if (!text) {
              return { success: false, error: '请提供待翻译文本' }
            }
            try {
              const result = await this.engine.translate(
                text,
                sourceLang ?? settings?.defaultSourceLang ?? 'auto',
                targetLang ?? settings?.defaultTargetLang ?? 'zh-CN'
              )

              // 保存到历史记录
              await this.history.save({
                sourceText: result.sourceText,
                translatedText: result.translatedText,
                sourceLang: result.sourceLang,
                targetLang: result.targetLang
              })

              return { success: true, data: result }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 检测语言 ---
      {
        type: 'tool',
        name: 'translate_detect',
        description: '检测语言',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { text } = p as { text: string }
            if (!text) {
              return { success: false, error: '请提供文本' }
            }
            try {
              const result = this.detector.detect(text)
              return { success: true, data: result }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 翻译历史 ---
      {
        type: 'tool',
        name: 'translate_history',
        description: '翻译历史',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { action, keyword, limit, offset, id } = p as {
              action?: string; keyword?: string; limit?: number; offset?: number; id?: string
            }
            try {
              if (action === 'search' && keyword) {
                const results = await this.history.search(keyword)
                return { success: true, data: results }
              }
              if (action === 'delete' && id) {
                const deleted = await this.history.delete(id)
                return { success: deleted, error: deleted ? undefined : '记录不存在' }
              }
              // 默认：获取历史列表
              const results = await this.history.getHistory(limit ?? 50, offset ?? 0)
              return { success: true, data: results }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 收藏常用翻译 ---
      {
        type: 'tool',
        name: 'translate_favorites',
        description: '收藏常用翻译',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { action, id } = p as { action?: string; id?: string }
            try {
              if (action === 'toggle' && id) {
                const result = await this.history.toggleFavorite(id)
                return { success: result, error: result ? undefined : '记录不存在' }
              }
              // 默认：获取收藏列表
              const favorites = await this.history.getFavorites()
              return { success: true, data: favorites }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      }
    ]
  }
}
