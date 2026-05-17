/**
 * SOUL 配置类型定义
 * 助手的人格、风格、个性化配置
 */

/** 助手性格特征 */
export interface SoulPersonality {
  /** 性格标签（如：温柔、活泼、专业、幽默） */
  readonly traits: readonly string[]
  /** 说话风格（如：亲切自然、正式专业、俏皮可爱） */
  readonly speakingStyle: string
  /** 情感倾向（如：温暖、冷静、热情） */
  readonly emotionalTone: string
}

/** SOUL 完整配置 */
export interface SoulConfig {
  /** 配置版本 */
  readonly version: number
  /** 助手名称 */
  readonly name: string
  /** 助手代号 */
  readonly codename: string
  /** 签名 emoji */
  readonly emoji: string
  /** 助手类型（如：AI助手、专属秘书、开发伙伴） */
  readonly role: string
  /** 性格配置 */
  readonly personality: SoulPersonality
  /** 默认语言 */
  readonly language: string
  /** 自我介绍 */
  readonly introduction: string
  /** 用户自定义备注 */
  readonly notes: string
  /** 创建时间 */
  readonly createdAt: string
  /** 最后更新时间 */
  readonly updatedAt: string
}

/** SOUL 创建请求（来自首次聊天引导） */
export interface SoulCreateRequest {
  readonly name: string
  readonly codename?: string
  readonly emoji?: string
  readonly role?: string
  readonly personality?: Partial<SoulPersonality>
  readonly language?: string
  readonly introduction?: string
}

/** SOUL 状态 */
export type SoulStatus = 'none' | 'loading' | 'ready' | 'error'

/** 默认 SOUL 配置 */
export const DEFAULT_SOUL_CONFIG: SoulConfig = {
  version: 1,
  name: '小助手',
  codename: 'assistant',
  emoji: '🤖',
  role: 'AI助手',
  personality: {
    traits: ['友好', '专业'],
    speakingStyle: '亲切自然',
    emotionalTone: '温暖'
  },
  language: 'zh-CN',
  introduction: '你好！我是你的AI助手，很高兴认识你～',
  notes: '',
  createdAt: '',
  updatedAt: ''
}
