/**
 * SOUL 管理器 - 主进程
 * 负责助手人格配置的读取、创建、更新
 *
 * 存储路径: <userData>/config/soul.json
 * 兼容逻辑: 首次启动时检查本地 SOUL.md，有则继承
 */

import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { app } from 'electron'
import type { SoulConfig, SoulCreateRequest, SoulStatus } from '../../shared/types/soul'
import { DEFAULT_SOUL_CONFIG } from '../../shared/types/soul'

/** SOUL 配置文件路径 */
const SOUL_FILE_NAME = 'soul.json'

/**
 * SOUL 管理器实现
 * 单例模式，管理助手人格配置的完整生命周期
 */
export class SoulManager {
  private static instance: SoulManager | null = null

  private soulPath: string
  private cache: SoulConfig | null = null
  private status: SoulStatus = 'none'

  private constructor() {
    const configDir = join(app.getPath('userData'), 'config')
    mkdirSync(configDir, { recursive: true })
    this.soulPath = join(configDir, SOUL_FILE_NAME)
  }

  /** 获取单例实例 */
  static getInstance(): SoulManager {
    if (!SoulManager.instance) {
      SoulManager.instance = new SoulManager()
    }
    return SoulManager.instance
  }

  /**
   * 初始化 SOUL
   * 逻辑：检查本地 soul.json → 检查 SOUL.md 继承 → 返回状态
   */
  initialize(): SoulStatus {
    console.log('[Soul] 🔍 初始化 SOUL 系统...')

    // 1. 检查本地 soul.json
    if (this.loadFromDisk()) {
      this.status = 'ready'
      console.log(`[Soul] ✅ 已加载本地 SOUL: ${this.cache?.name} ${this.cache?.emoji}`)
      return 'ready'
    }

    // 2. 尝试从 SOUL.md 继承
    const inherited = this.tryInheritFromSoulMd()
    if (inherited) {
      this.status = 'ready'
      console.log(`[Soul] ✅ 从 SOUL.md 继承: ${this.cache?.name} ${this.cache?.emoji}`)
      return 'ready'
    }

    // 3. 无本地 SOUL，需要首次引导
    this.status = 'none'
    console.log('[Soul] 📝 未检测到本地 SOUL，需要首次引导')
    return 'none'
  }

  /**
   * 从本地文件加载 SOUL 配置
   * @returns 是否加载成功
   */
  private loadFromDisk(): boolean {
    try {
      if (!existsSync(this.soulPath)) return false

      const raw = readFileSync(this.soulPath, 'utf-8')
      const parsed = JSON.parse(raw) as SoulConfig

      // 基础校验
      if (!parsed.name || !parsed.version) {
        console.warn('[Soul] ⚠️ soul.json 格式不完整，忽略')
        return false
      }

      this.cache = { ...DEFAULT_SOUL_CONFIG, ...parsed }
      return true
    } catch (err) {
      console.error('[Soul] ❌ 读取 soul.json 失败:', err)
      return false
    }
  }

  /**
   * 尝试从 SOUL.md 继承配置
   * 解析 SOUL.md 中的关键信息，转换为 SoulConfig
   * @returns 是否继承成功
   */
  private tryInheritFromSoulMd(): boolean {
    try {
      const candidates = [
        join(__dirname, '../../SOUL.md'),
        join(__dirname, '../../../SOUL.md'),
        join(process.cwd(), 'SOUL.md'),
      ]

      for (const soulPath of candidates) {
        if (!existsSync(soulPath)) continue

        const content = readFileSync(soulPath, 'utf-8')
        const soul = this.parseSoulMd(content)

        if (soul) {
          this.cache = soul
          this.saveToDisk()
          return true
        }
      }
    } catch (err) {
      console.error('[Soul] ❌ 继承 SOUL.md 失败:', err)
    }
    return false
  }

  /**
   * 解析 SOUL.md 内容为 SoulConfig
   * @param content - SOUL.md 文件内容
   * @returns 解析后的 SoulConfig，失败返回 null
   */
  private parseSoulMd(content: string): SoulConfig | null {
    // 提取名称：匹配 "代号 **名称**" 或 "名字：**名称**"
    const nameMatch =
      content.match(/代号\s*\*{0,2}([^*🌸\s]+)\*{0,2}/) ??
      content.match(/名字[：:]\s*\*{0,2}([^*🌸\s]+)\*{0,2}/)

    if (!nameMatch?.[1]) return null

    const name = nameMatch[1].trim()

    // 提取 emoji
    const emojiMatch = content.match(/[\u{1F300}-\u{1F9FF}]/u)
    const emoji = emojiMatch?.[0] ?? '🤖'

    // 提取性格特征
    const traits: string[] = []
    const traitKeywords = ['温柔', '活泼', '专业', '幽默', '细心', '博学', '可靠', '体贴', '亲切']
    for (const keyword of traitKeywords) {
      if (content.includes(keyword)) traits.push(keyword)
    }

    // 提取说话风格
    let speakingStyle = '亲切自然'
    if (content.includes('正式')) speakingStyle = '正式专业'
    else if (content.includes('俏皮')) speakingStyle = '俏皮可爱'
    else if (content.includes('简洁')) speakingStyle = '简洁直接'

    const now = new Date().toISOString()

    return {
      ...DEFAULT_SOUL_CONFIG,
      version: 1,
      name,
      emoji,
      personality: {
        traits: traits.length > 0 ? traits : DEFAULT_SOUL_CONFIG.personality.traits,
        speakingStyle,
        emotionalTone: '温暖',
      },
      introduction: `你好！我是${name}，很高兴认识你～`,
      createdAt: now,
      updatedAt: now,
    }
  }

  /** 保存 SOUL 配置到磁盘 */
  private saveToDisk(): void {
    try {
      if (!this.cache) return
      const data = JSON.stringify(this.cache, null, 2)
      writeFileSync(this.soulPath, data, 'utf-8')
      console.log('[Soul] 💾 SOUL 配置已保存')
    } catch (err) {
      console.error('[Soul] ❌ 保存 soul.json 失败:', err)
    }
  }

  /**
   * 创建新的 SOUL 配置（首次聊天引导完成后调用）
   * @param request - 用户填写的 SOUL 信息
   * @returns 创建后的完整 SoulConfig
   */
  createSoul(request: SoulCreateRequest): SoulConfig {
    const now = new Date().toISOString()

    this.cache = {
      version: 1,
      name: request.name || DEFAULT_SOUL_CONFIG.name,
      codename: request.codename ?? request.name?.toLowerCase().replace(/\s+/g, '-') ?? 'assistant',
      emoji: request.emoji ?? '🤖',
      role: request.role ?? 'AI助手',
      personality: {
        traits: request.personality?.traits ?? DEFAULT_SOUL_CONFIG.personality.traits,
        speakingStyle: request.personality?.speakingStyle ?? '亲切自然',
        emotionalTone: request.personality?.emotionalTone ?? '温暖',
      },
      language: request.language ?? 'zh-CN',
      introduction: request.introduction ?? `你好！我是${request.name}，很高兴认识你～`,
      notes: '',
      createdAt: now,
      updatedAt: now,
    }

    this.saveToDisk()
    this.status = 'ready'

    console.log(`[Soul] 🎉 SOUL 创建成功: ${this.cache.name} ${this.cache.emoji}`)
    return this.cache
  }

  /**
   * 更新 SOUL 配置
   * @param updates - 部分更新字段
   * @returns 更新后的完整 SoulConfig
   */
  updateSoul(updates: Partial<SoulCreateRequest>): SoulConfig | null {
    if (!this.cache) {
      console.warn('[Soul] ⚠️ SOUL 未初始化，无法更新')
      return null
    }

    this.cache = {
      ...this.cache,
      ...updates,
      personality: {
        ...this.cache.personality,
        ...(updates.personality ?? {}),
      },
      updatedAt: new Date().toISOString(),
    } as SoulConfig

    this.saveToDisk()
    console.log('[Soul] ✏️ SOUL 已更新')
    return this.cache
  }

  /** 获取当前 SOUL 配置 */
  getSoul(): SoulConfig | null {
    return this.cache
  }

  /** 获取 SOUL 状态 */
  getStatus(): SoulStatus {
    return this.status
  }

  /** 重置 SOUL（删除配置文件） */
  resetSoul(): void {
    this.cache = null
    this.status = 'none'
    try {
      const { unlinkSync } = require('fs')
      if (existsSync(this.soulPath)) {
        unlinkSync(this.soulPath)
      }
    } catch {
      // ignore
    }
    console.log('[Soul] 🗑️ SOUL 已重置')
  }
}
