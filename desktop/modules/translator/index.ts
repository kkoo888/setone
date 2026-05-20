import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import type { TranslatorSettings } from './types'
import { TranslationEngine } from './services/TranslationEngine'
import { LanguageDetector } from './services/LanguageDetector'
import { TranslationRepository } from './repositories/translation-repository'
import { TranslationService } from './services/translation-service'

/**
 * 翻译面板模块
 * 文本翻译、语言检测、翻译历史管理、收藏功能
 * v2: 新增"小希翻译"——先查知识库，没找到再调大模型
 */
export default class TranslatorModule implements Module {
  id = 'translator'
  meta!: import('../../src/main/types/module').ModuleMeta

  private context!: ModuleContext
  private engine!: TranslationEngine
  private detector!: LanguageDetector
  private history!: TranslationService
  private assistantName: string = '小希'

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    const settings = context.config as unknown as TranslatorSettings

    // 读取助手名称设置
    this.assistantName = settings.assistantName ?? '小希'

    // 初始化翻译引擎
    this.engine = new TranslationEngine(context.ai, context.logger)

    // 初始化语言检测器
    this.detector = new LanguageDetector()

    // 初始化历史存储（Repository → Service 分层）
    const repo = new TranslationRepository(context.db, context.logger, settings.maxHistory ?? 200)
    this.history = new TranslationService(repo, context.logger)
    await this.history.init()

    context.logger.info(`翻译面板模块已激活（助手名称: ${this.assistantName}）`)
  }

  async deactivate(): Promise<void> {
    // 清理 DB 引用
    this.history = undefined as never
    this.context.logger.info('翻译面板模块已停用')
  }

  /**
   * 获取知识库搜索接口
   * 通过模块系统获取 knowledge-base 模块的搜索能力
   */
  private async getKBSearch(): Promise<{ search: (q: string, topK?: number) => Promise<any[]> } | null> {
    try {
      // 通过 invoke 调用知识库的搜索工具
      const kbSearch = {
        search: async (query: string, topK: number = 5) => {
          const result = await this.context.invoke?.('kb_search', { query, topK })
          if (result?.success && result.data) {
            return result.data.map((r: any) => ({
              content: r.content,
              score: r.score,
              fileName: r.fileName
            }))
          }
          return []
        }
      }
      return kbSearch
    } catch {
      this.context.logger?.debug?.('知识库模块不可用，小希翻译将直接使用 LLM')
      return null
    }
  }

  getCapabilities(): Capability[] {
    const settings = this.context?.config as unknown as TranslatorSettings

    return [
      // --- 翻译文本（仅查知识库）---
      {
        type: 'tool',
        name: 'translate_text',
        description: '翻译文本（仅查知识库，未找到则提示）',
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
              const resolvedTarget = targetLang ?? settings?.defaultTargetLang ?? 'zh-CN'
              const kbSearch = await this.getKBSearch()

              if (!kbSearch) {
                return { success: false, error: '知识库模块不可用，请检查知识库是否已启用' }
              }

              // 只查知识库
              const result = await this.engine.translateWithKB(
                text,
                sourceLang ?? settings?.defaultSourceLang ?? 'auto',
                resolvedTarget,
                kbSearch,
                this.assistantName
              )

              if (result.kbMatch) {
                // 知识库命中
                await this.history.save({
                  sourceText: result.sourceText,
                  translatedText: result.translatedText,
                  sourceLang: result.sourceLang,
                  targetLang: result.targetLang
                })
                return {
                  success: true,
                  data: {
                    ...result,
                    translationSource: `📚 知识库命中（来源: ${result.kbSource}）`
                  }
                }
              } else {
                // 知识库未找到
                return {
                  success: false,
                  error: '📚 知识库中未找到相关翻译，请尝试导入翻译资料或使用「小希翻译」'
                }
              }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 小希翻译（新增：先查知识库，没找到再调大模型）---
      {
        type: 'tool',
        name: 'translate_with_kb',
        description: `${this.assistantName}翻译：优先从知识库查找已有翻译，未命中再调用大模型`,
        priority: 15, // 优先级高于普通翻译
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
              // 获取知识库搜索接口
              const kbSearch = await this.getKBSearch()

              const result = await this.engine.translateWithKB(
                text,
                sourceLang ?? settings?.defaultSourceLang ?? 'auto',
                targetLang ?? settings?.defaultTargetLang ?? 'zh-CN',
                kbSearch,
                this.assistantName
              )

              // 保存到历史记录（标记来源）
              await this.history.save({
                sourceText: result.sourceText,
                translatedText: result.translatedText,
                sourceLang: result.sourceLang,
                targetLang: result.targetLang
              })

              return {
                success: true,
                data: {
                  ...result,
                  // 附加信息
                  translationSource: result.kbMatch
                    ? `📚 知识库命中（来源: ${result.kbSource}）`
                    : `💛 ${this.assistantName} 翻译`
                }
              }
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
