/** 翻译记录 */
export interface TranslationRecord {
  id: string
  sourceText: string
  translatedText: string
  sourceLang: string
  targetLang: string
  isFavorite: boolean
  createdAt: number
}

/** 翻译请求参数 */
export interface TranslateParams {
  text: string
  sourceLang?: string
  targetLang?: string
}

/** 翻译结果 */
export interface TranslateResult {
  id: string
  sourceText: string
  translatedText: string
  sourceLang: string
  targetLang: string
  /** 翻译引擎来源：'llm' | 'kb' | 'direct' | '小希-llm' 等 */
  engine?: string
  /** 是否命中知识库 */
  kbMatch?: boolean
  /** 知识库来源文件 */
  kbSource?: string
}

/** 语言检测结果 */
export interface DetectResult {
  lang: string
  confidence: number
  langName: string
}

/** 翻译模块设置 */
export interface TranslatorSettings {
  defaultSourceLang: string
  defaultTargetLang: string
  engine: string
  maxHistory: number
  /** 助手名称（用于"小希翻译"按钮显示） */
  assistantName?: string
}

/** 语言代码 → 名称映射 */
export const LANG_NAMES: Record<string, string> = {
  'zh-CN': '中文（简体）',
  'zh-TW': '中文（繁体）',
  'en': '英语',
  'ja': '日语',
  'ko': '韩语',
  'fr': '法语',
  'de': '德语',
  'es': '西班牙语',
  'ru': '俄语',
  'pt': '葡萄牙语',
  'ar': '阿拉伯语',
  'it': '意大利语',
  'auto': '自动检测'
}
