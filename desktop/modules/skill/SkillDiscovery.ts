import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import type { Logger } from '../../src/main/types/logger'
import type { SkillMeta, Permission, SkillLevelValue } from './types'

/** YAML 风格解析结果 */
interface FrontmatterBlock {
  name?: string
  description?: string
  version?: string
  author?: string
  icon?: string
  tags?: string[]
  permissions?: Permission[]
  level?: SkillLevelValue
}

/**
 * 技能发现引擎
 * 扫描目录中的 SKILL.md 文件，解析元数据、标签和权限声明
 */
export class SkillDiscovery {
  private logger: Logger
  private activeStates: Map<string, boolean>

  constructor(logger: Logger, activeStates?: Map<string, boolean>) {
    this.logger = logger
    this.activeStates = activeStates ?? new Map()
  }

  /** 扫描目录，发现所有 SKILL.md 文件 */
  async discover(skillDirs: string[]): Promise<SkillMeta[]> {
    const skills: SkillMeta[] = []
    for (const dir of skillDirs) {
      try {
        const found = await this.scanDirectory(dir)
        skills.push(...found)
      } catch (e) {
        this.logger.warn(`扫描目录失败: ${dir}`)
      }
    }
    this.logger.info(`发现 ${skills.length} 个技能`)
    return skills
  }

  /** 扫描单个目录下的技能 */
  private async scanDirectory(dir: string): Promise<SkillMeta[]> {
    const skills: SkillMeta[] = []
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return []
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const s = await stat(fullPath).catch(() => null)
      if (!s?.isDirectory()) continue

      const skillMd = join(fullPath, 'SKILL.md')
      try {
        await stat(skillMd)
        const meta = await this.parseSkillMd(skillMd, fullPath)
        if (meta) skills.push(meta)
      } catch {
        /* no SKILL.md */
      }
    }
    return skills
  }

  /** 解析 SKILL.md 头部信息（支持 YAML frontmatter 和 markdown 标题） */
  async parseSkillMd(filePath: string, skillDir: string): Promise<SkillMeta | null> {
    try {
      const content = await readFile(filePath, 'utf-8')
      const frontmatter = this.extractFrontmatter(content)
      const id = skillDir.split('/').pop() ?? 'unknown'

      const meta: SkillMeta = {
        id,
        name: frontmatter.name ?? this.extractHeading(content) ?? 'Unnamed Skill',
        description: frontmatter.description ?? this.extractQuote(content) ?? '',
        version: frontmatter.version ?? '1.0.0',
        author: frontmatter.author ?? 'unknown',
        path: skillDir,
        icon: frontmatter.icon,
        tags: frontmatter.tags ?? [],
        permissions: frontmatter.permissions ?? [],
        level: frontmatter.level ?? 'meta',
        active: this.activeStates.get(id) ?? true,
        installSource: 'local',
        installedAt: Date.now(),
        useCount: 0
      }

      return meta
    } catch {
      return null
    }
  }

  /** 提取 YAML frontmatter 块（--- 包裹的部分） */
  private extractFrontmatter(content: string): FrontmatterBlock {
    const result: FrontmatterBlock = {}
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!fmMatch) return result

    const block = fmMatch[1]
    const lines = block.split('\n')

    for (const line of lines) {
      const kvMatch = line.match(/^(\w+):\s*(.+)$/)
      if (!kvMatch) continue

      const key = kvMatch[1].trim()
      const rawValue = kvMatch[2].trim()

      switch (key) {
        case 'name':
          result.name = rawValue
          break
        case 'description':
          result.description = rawValue
          break
        case 'version':
          result.version = rawValue
          break
        case 'author':
          result.author = rawValue
          break
        case 'icon':
          result.icon = rawValue
          break
        case 'level':
          if (['meta', 'description', 'full'].includes(rawValue)) {
            result.level = rawValue as SkillLevelValue
          }
          break
        case 'tags':
          result.tags = this.parseYamlArray(rawValue)
          break
        case 'permissions':
          result.permissions = this.parseYamlArray(rawValue).filter(
            (v): v is Permission => this.isValidPermission(v)
          )
          break
      }
    }

    return result
  }

  /** 解析 YAML 数组格式 [item1, item2] 或 item1, item2 */
  private parseYamlArray(raw: string): string[] {
    const cleaned = raw.replace(/^\[|\]$/g, '').trim()
    if (!cleaned) return []
    return cleaned.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  }

  /** 校验权限值是否合法 */
  private isValidPermission(value: string): value is Permission {
    const valid: Permission[] = [
      'file.read', 'file.write', 'network', 'exec',
      'screen', 'clipboard', 'notification'
    ]
    return valid.includes(value as Permission)
  }

  /** 提取 markdown 标题（# 开头） */
  private extractHeading(content: string): string | null {
    const match = content.match(/^#\s+(.+)$/m)
    return match?.[1]?.trim() ?? null
  }

  /** 提取引用描述（> 开头） */
  private extractQuote(content: string): string | null {
    const match = content.match(/^>\s*(.+)$/m)
    return match?.[1]?.trim() ?? null
  }

  /** 从 SKILL.md 内容中检测实际使用的权限 */
  detectPermissions(content: string): Permission[] {
    const detected: Permission[] = []
    const checks: Array<{ pattern: RegExp; perm: Permission }> = [
      { pattern: /readFile|readdir|stat|access|createReadStream/i, perm: 'file.read' },
      { pattern: /writeFile|appendFile|mkdir|rename|unlink|createWriteStream/i, perm: 'file.write' },
      { pattern: /fetch|axios|request|http\.|https\./i, perm: 'network' },
      { pattern: /exec|spawn|execFile|fork|child_process/i, perm: 'exec' },
      { pattern: /screenshot|capture|screen|getDisplayMedia/i, perm: 'screen' },
      { pattern: /clipboard|readText|writeText/i, perm: 'clipboard' },
      { pattern: /notification|notify|showNotification/i, perm: 'notification' }
    ]

    for (const { pattern, perm } of checks) {
      if (pattern.test(content)) {
        detected.push(perm)
      }
    }

    return [...new Set(detected)]
  }
}
