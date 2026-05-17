import type { CommandEntry, CommandSearchResult, CommandCategory } from '../types'

/** 使用记录 */
interface UsageRecord {
  id: string
  usedAt: number
  count: number
}

/**
 * 命令注册表
 * 管理所有命令的注册、搜索、使用统计
 */
export class CommandRegistry {
  private commands = new Map<string, CommandEntry>()
  private usage = new Map<string, UsageRecord>()
  private readonly maxResults: number

  constructor(options?: { maxResults?: number }) {
    this.maxResults = options?.maxResults ?? 20
  }

  /** 注册命令 */
  register(entry: CommandEntry): void {
    this.commands.set(entry.id, entry)
    // 恢复使用记录
    const record = this.usage.get(entry.id)
    if (record) {
      entry.useCount = record.count
      entry.recentUsedAt = record.usedAt
    }
  }

  /** 批量注册 */
  registerAll(entries: CommandEntry[]): void {
    for (const entry of entries) {
      this.register(entry)
    }
  }

  /** 注销命令 */
  unregister(id: string): boolean {
    return this.commands.delete(id)
  }

  /** 按分类注销 */
  unregisterByCategory(category: CommandCategory): number {
    let count = 0
    for (const [id, cmd] of this.commands) {
      if (cmd.category === category) {
        this.commands.delete(id)
        count++
      }
    }
    return count
  }

  /** 获取命令 */
  get(id: string): CommandEntry | undefined {
    return this.commands.get(id)
  }

  /** 获取所有命令 */
  getAll(): CommandEntry[] {
    return Array.from(this.commands.values())
  }

  /** 模糊搜索 */
  search(query: string): CommandSearchResult[] {
    if (!query.trim()) {
      // 无查询时返回最近使用的命令
      return this.getRecentCommands()
    }

    const normalizedQuery = query.toLowerCase().trim()
    const results: CommandSearchResult[] = []

    for (const cmd of this.commands.values()) {
      const score = this.matchScore(normalizedQuery, cmd)
      if (score > 0) {
        results.push({ command: cmd, score })
      }
    }

    // 综合排序：匹配度 × 0.6 + 使用频率 × 0.3 + 最近使用 × 0.1
    results.sort((a, b) => {
      const scoreA = a.score * 0.6 + this.frequencyScore(a.command) * 0.3 + this.recencyScore(a.command) * 0.1
      const scoreB = b.score * 0.6 + this.frequencyScore(b.command) * 0.3 + this.recencyScore(b.command) * 0.1
      return scoreB - scoreA
    })

    return results.slice(0, this.maxResults)
  }

  /** 记录命令使用 */
  recordUsage(id: string): void {
    const cmd = this.commands.get(id)
    if (cmd) {
      cmd.useCount++
      cmd.recentUsedAt = Date.now()
      this.usage.set(id, { id, usedAt: cmd.recentUsedAt, count: cmd.useCount })
    }
  }

  /** 获取最近使用的命令（无搜索词时展示） */
  private getRecentCommands(): CommandSearchResult[] {
    const sorted = [...this.commands.values()]
      .filter(c => c.recentUsedAt)
      .sort((a, b) => (b.recentUsedAt ?? 0) - (a.recentUsedAt ?? 0))
      .slice(0, this.maxResults)

    return sorted.map(cmd => ({ command: cmd, score: 0 }))
  }

  /** 计算匹配分数 (0-1) */
  private matchScore(query: string, cmd: CommandEntry): number {
    const label = cmd.label.toLowerCase()
    const desc = (cmd.description ?? '').toLowerCase()
    const keywords = cmd.keywords.map(k => k.toLowerCase())

    // 前缀匹配（最高权重）
    if (label.startsWith(query)) return 1.0
    if (label.includes(query)) return 0.85

    // 关键词匹配
    for (const kw of keywords) {
      if (kw.startsWith(query)) return 0.8
      if (kw.includes(query)) return 0.65
    }

    // 描述匹配
    if (desc.includes(query)) return 0.5

    // 模糊匹配：逐字符匹配
    if (this.fuzzyMatch(query, label)) return 0.4
    if (this.fuzzyMatch(query, desc)) return 0.3

    return 0
  }

  /** 模糊匹配：查询字符按顺序出现在目标中 */
  private fuzzyMatch(query: string, target: string): boolean {
    let qi = 0
    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) qi++
    }
    return qi === query.length
  }

  /** 使用频率分数 (0-1) */
  private frequencyScore(cmd: CommandEntry): number {
    const maxCount = Math.max(1, ...[...this.commands.values()].map(c => c.useCount))
    return cmd.useCount / maxCount
  }

  /** 最近使用分数 (0-1) */
  private recencyScore(cmd: CommandEntry): number {
    if (!cmd.recentUsedAt) return 0
    const elapsed = Date.now() - cmd.recentUsedAt
    const hour = 3600000
    if (elapsed < hour) return 1.0
    if (elapsed < 24 * hour) return 0.7
    if (elapsed < 7 * 24 * hour) return 0.4
    return 0.1
  }
}
