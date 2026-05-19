import type { AIService, ChatMessage } from '../../../src/main/types/ai'
import type { Logger } from '../../../src/main/types/logger'
import type { TranslateResult } from '../types'
import { randomUUID } from 'crypto'
import { LanguageDetector } from './LanguageDetector'

/** 语言代码 → 英文名称（用于 prompt） */
const LANG_EN_NAMES: Record<string, string> = {
  'zh-CN': 'Simplified Chinese',
  'zh-TW': 'Traditional Chinese',
  'en': 'English',
  'ja': 'Japanese',
  'ko': 'Korean',
  'fr': 'French',
  'de': 'German',
  'es': 'Spanish',
  'ru': 'Russian',
  'pt': 'Portuguese',
  'ar': 'Arabic',
  'it': 'Italian',
  'auto': 'auto-detected language'
}

/** 知识库搜索接口（避免直接依赖 knowledge-base 模块） */
interface KBSearchProvider {
  search(query: string, topK?: number): Promise<Array<{ content: string; score: number; fileName: string }>>
}

/**
 * 翻译引擎
 * 调用 Ollama 本地模型进行文本翻译
 */
export class TranslationEngine {
  private readonly ai: AIService
  private readonly logger: Logger
  private readonly detector: LanguageDetector

  constructor(ai: AIService, logger: Logger) {
    this.ai = ai
    this.logger = logger
    this.detector = new LanguageDetector()
  }

  /**
   * 翻译文本
   * @param text - 原文
   * @param sourceLang - 源语言（auto 为自动检测）
   * @param targetLang - 目标语言
   * @returns 翻译结果
   */
  async translate(text: string, sourceLang: string = 'auto', targetLang: string = 'zh-CN'): Promise<TranslateResult> {
    // 自动检测源语言
    let resolvedSourceLang = sourceLang
    if (sourceLang === 'auto') {
      const detected = this.detector.detect(text)
      resolvedSourceLang = detected.lang
      // 如果检测结果与目标语言相同，直接返回
      if (resolvedSourceLang === targetLang) {
        return {
          id: randomUUID(),
          sourceText: text,
          translatedText: text,
          sourceLang: resolvedSourceLang,
          targetLang,
          engine: 'direct'
        }
      }
    }

    const fromName = LANG_EN_NAMES[resolvedSourceLang] ?? resolvedSourceLang
    const toName = LANG_EN_NAMES[targetLang] ?? targetLang

    const prompt = `Translate the following text from ${fromName} to ${toName}. Output ONLY the translation, no explanations.\n\nText: ${text}`

    const messages: ChatMessage[] = [
      { role: 'user', content: prompt }
    ]

    const response = await this.ai.chat(messages, {
      temperature: 0.2,
      maxTokens: 2000
    })

    return {
      id: randomUUID(),
      sourceText: text,
      translatedText: response.message.content.trim(),
      sourceLang: resolvedSourceLang,
      targetLang,
      engine: 'llm'
    }
  }

  /**
   * 小希翻译：先查知识库，没找到再调大模型
   * @param text - 原文
   * @param sourceLang - 源语言
   * @param targetLang - 目标语言
   * @param kbSearch - 知识库搜索接口
   * @param assistantName - 助手名称（用于标记翻译来源）
   */
  async translateWithKB(
    text: string,
    sourceLang: string = 'auto',
    targetLang: string = 'zh-CN',
    kbSearch: KBSearchProvider | null,
    assistantName: string = '小希'
  ): Promise<TranslateResult & { kbMatch?: boolean; kbSource?: string }> {
    // 自动检测源语言
    let resolvedSourceLang = sourceLang
    if (sourceLang === 'auto') {
      const detected = this.detector.detect(text)
      resolvedSourceLang = detected.lang
      if (resolvedSourceLang === targetLang) {
        return {
          id: randomUUID(),
          sourceText: text,
          translatedText: text,
          sourceLang: resolvedSourceLang,
          targetLang,
          engine: 'direct',
          kbMatch: false
        }
      }
    }

    // 第一步：尝试从知识库查找已有翻译
    if (kbSearch) {
      try {
        const kbResult = await this.searchKBTranslation(text, targetLang, kbSearch)
        if (kbResult) {
          this.logger.info(`知识库命中翻译: "${text}" → "${kbResult.translation}" (来源: ${kbResult.source})`)
          return {
            id: randomUUID(),
            sourceText: text,
            translatedText: kbResult.translation,
            sourceLang: resolvedSourceLang,
            targetLang,
            engine: 'kb',
            kbMatch: true,
            kbSource: kbResult.source
          }
        }
      } catch (err) {
        this.logger.warn(`知识库翻译查询失败，回退到 LLM: ${(err as Error).message}`)
      }
    }

    // 第二步：知识库没找到，调大模型翻译
    const llmResult = await this.translate(text, sourceLang, targetLang)
    return {
      ...llmResult,
      engine: `${assistantName} 翻译`,
      kbMatch: false
    }
  }

  /**
   * 从知识库中搜索翻译结果
   * 通过构造翻译对查询，搜索知识库中已有的翻译记录
   */
  private async searchKBTranslation(
    text: string,
    targetLang: string,
    kbSearch: KBSearchProvider
  ): Promise<{ translation: string; source: string } | null> {
    // 构造搜索查询：原文 + 目标语言关键词
    const langHint = LANG_EN_NAMES[targetLang] ?? targetLang
    const query = `翻译 ${text} → ${langHint}`

    const results = await kbSearch.search(query, 5)

    if (!results || results.length === 0) return null

    // 分析搜索结果，寻找翻译对
    for (const result of results) {
      if (result.score < 0.6) continue // 相关度太低，跳过

      const translation = this.extractTranslationFromContent(text, result.content, targetLang)
      if (translation) {
        return {
          translation,
          source: result.fileName
        }
      }
    }

    return null
  }

  /**
   * 从知识库文档内容中提取翻译结果
   * 支持多种翻译对格式：
   * - "原文 → 译文"
   * - "原文: 译文"
   * - "原文 | 译文"
   * - JSON 格式 { "原文": "译文" }
   * - CSV 格式 "原文,译文"
   */
  private extractTranslationFromContent(
    sourceText: string,
    content: string,
    targetLang: string
  ): string | null {
    const normalizedSource = sourceText.trim().toLowerCase()

    // 尝试按行匹配
    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // 格式1: "原文 → 译文" 或 "原文 -> 译文"
      const arrowMatch = trimmed.match(/^(.+?)\s*(?:→|->|=>)\s*(.+)$/)
      if (arrowMatch) {
        const src = arrowMatch[1].trim().toLowerCase()
        const tgt = arrowMatch[2].trim()
        if (src === normalizedSource && tgt) return tgt
      }

      // 格式2: "原文: 译文" 或 "原文：译文"
      const colonMatch = trimmed.match(/^(.+?)\s*[:：]\s*(.+)$/)
      if (colonMatch) {
        const src = colonMatch[1].trim().toLowerCase()
        const tgt = colonMatch[2].trim()
        if (src === normalizedSource && tgt) return tgt
      }

      // 格式3: "原文 | 译文"
      const pipeMatch = trimmed.match(/^(.+?)\s*\|\s*(.+)$/)
      if (pipeMatch) {
        const src = pipeMatch[1].trim().toLowerCase()
        const tgt = pipeMatch[2].trim()
        if (src === normalizedSource && tgt) return tgt
      }

      // 格式4: JSON { "key": "value" }
      try {
        const jsonMatch = trimmed.match(/^\{.*\}$/)
        if (jsonMatch) {
          const obj = JSON.parse(trimmed)
          for (const [key, value] of Object.entries(obj)) {
            if (key.trim().toLowerCase() === normalizedSource && typeof value === 'string') {
              return value
            }
          }
        }
      } catch { /* not JSON */ }
    }

    // 格式5: 整段内容中查找原文，如果包含则返回上下文
    const idx = content.toLowerCase().indexOf(normalizedSource)
    if (idx >= 0) {
      // 查找原文后面紧跟的翻译（跳过空白和分隔符）
      const afterSource = content.substring(idx + normalizedSource.length).trim()
      const separatorMatch = afterSource.match(/^[:：|→\->=\s]+(.+?)[\n\r]/)
      if (separatorMatch) {
        return separatorMatch[1].trim()
      }
    }

    return null
  }

  /**
   * 检测语言
   */
  detectLanguage(text: string) {
    return this.detector.detect(text)
  }
}
