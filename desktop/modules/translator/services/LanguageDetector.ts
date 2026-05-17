import type { DetectResult } from '../types'
import { LANG_NAMES } from '../types'

/**
 * 语言检测服务
 * 基于 Unicode 字符范围的启发式语言检测
 */
export class LanguageDetector {
  /**
   * 检测文本语言
   * @param text - 输入文本
   * @returns 检测结果
   */
  detect(text: string): DetectResult {
    if (!text || text.trim().length === 0) {
      return { lang: 'unknown', confidence: 0, langName: '未知' }
    }

    const trimmed = text.trim()
    const totalChars = trimmed.length

    // 统计各语言字符占比
    let cjkCount = 0
    let hiraganaKatakanaCount = 0
    let hangulCount = 0
    let latinCount = 0
    let cyrillicCount = 0
    let arabicCount = 0

    for (const char of trimmed) {
      const code = char.codePointAt(0) ?? 0

      if (this.isCJK(code)) {
        cjkCount++
      }
      if (this.isHiraganaKatakana(code)) {
        hiraganaKatakanaCount++
      }
      if (this.isHangul(code)) {
        hangulCount++
      }
      if (this.isLatin(code)) {
        latinCount++
      }
      if (this.isCyrillic(code)) {
        cyrillicCount++
      }
      if (this.isArabic(code)) {
        arabicCount++
      }
    }

    // 判断逻辑（按优先级）
    const threshold = 0.15

    // 日语：包含平假名/片假名
    if (hiraganaKatakanaCount > 0 && (hiraganaKatakanaCount + cjkCount) / totalChars > threshold) {
      return { lang: 'ja', confidence: 0.9, langName: LANG_NAMES['ja'] }
    }

    // 韩语
    if (hangulCount / totalChars > threshold) {
      return { lang: 'ko', confidence: 0.9, langName: LANG_NAMES['ko'] }
    }

    // 中文：有 CJK 字符但无平假名/片假名
    if (cjkCount / totalChars > threshold) {
      // 简单判断简繁：包含常见简体字特征
      const simplifiedScore = this.simplifiedScore(trimmed)
      const lang = simplifiedScore > 0.5 ? 'zh-CN' : 'zh-TW'
      return { lang, confidence: 0.85, langName: LANG_NAMES[lang] }
    }

    // 俄语
    if (cyrillicCount / totalChars > threshold) {
      return { lang: 'ru', confidence: 0.9, langName: LANG_NAMES['ru'] }
    }

    // 阿拉伯语
    if (arabicCount / totalChars > threshold) {
      return { lang: 'ar', confidence: 0.9, langName: LANG_NAMES['ar'] }
    }

    // 拉丁字母 → 默认英语（无法精确区分拉丁语系语言）
    if (latinCount / totalChars > 0.5) {
      return { lang: 'en', confidence: 0.7, langName: LANG_NAMES['en'] }
    }

    return { lang: 'auto', confidence: 0.3, langName: '自动检测' }
  }

  /** CJK 统一表意文字 */
  private isCJK(code: number): boolean {
    return (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x20000 && code <= 0x2A6DF)
  }

  /** 平假名 + 片假名 */
  private isHiraganaKatakana(code: number): boolean {
    return (code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF)
  }

  /** 韩文 */
  private isHangul(code: number): boolean {
    return (code >= 0xAC00 && code <= 0xD7AF) || (code >= 0x1100 && code <= 0x11FF)
  }

  /** 拉丁字母 */
  private isLatin(code: number): boolean {
    return (code >= 0x0041 && code <= 0x007A) ||
      (code >= 0x00C0 && code <= 0x024F) ||
      (code >= 0x1E00 && code <= 0x1EFF)
  }

  /** 西里尔字母 */
  private isCyrillic(code: number): boolean {
    return code >= 0x0400 && code <= 0x04FF
  }

  /** 阿拉伯字母 */
  private isArabic(code: number): boolean {
    return code >= 0x0600 && code <= 0x06FF
  }

  /**
   * 简体字评分（基于常见简体特征字）
   * 返回 0~1，越高越可能是简体
   */
  private simplifiedScore(text: string): number {
    // 常见简体特征字（繁体中不存在或写法不同）
    const simplifiedChars = '国东车长门间书电马鸟鱼学说认为来开会还应对经济'
    let matchCount = 0
    for (const char of text) {
      if (simplifiedChars.includes(char)) {
        matchCount++
      }
    }
    return matchCount / Math.max(text.length, 1)
  }
}
