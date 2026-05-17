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
          targetLang
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
      targetLang
    }
  }

  /**
   * 检测语言
   */
  detectLanguage(text: string) {
    return this.detector.detect(text)
  }
}
