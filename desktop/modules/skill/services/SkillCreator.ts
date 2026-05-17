/**
 * AI 辅助创建技能引擎
 * 根据用户自然语言描述生成完整技能
 */
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Logger } from '../../../src/main/types/logger'
import type { AIService } from '../../../src/main/types/ai'
import type { SkillMeta } from '../types'

/** 创建结果 */
export interface CreateResult {
  skillId: string
  files: string[]
  meta: SkillMeta
  skillMd: string
}

/**
 * 技能创建引擎
 * 根据用户描述调用 AI 生成 SKILL.md 和代码骨架
 */
export class SkillCreator {
  private logger: Logger
  private ai: AIService
  private skillsDir: string

  constructor(logger: Logger, ai: AIService, skillsDir: string) {
    this.logger = logger
    this.ai = ai
    this.skillsDir = skillsDir
  }

  /**
   * 根据描述创建新技能
   * @param description - 用户对技能功能的自然语言描述
   * @returns 创建结果（ID、文件列表、元数据、生成内容）
   */
  async createFromDescription(description: string): Promise<CreateResult> {
    // 1. 调用 AI 生成 SKILL.md 内容
    const generated = await this.generateFromAI(description)

    // 2. 生成技能 ID
    const skillId = this.generateId(generated.name)
    const skillDir = join(this.skillsDir, skillId)

    // 3. 创建目录并写入文件
    await mkdir(skillDir, { recursive: true })

    const files: string[] = []

    // 写入 SKILL.md
    await writeFile(join(skillDir, 'SKILL.md'), generated.skillMd, 'utf-8')
    files.push('SKILL.md')

    // 如果有代码，写入 index.ts
    if (generated.code) {
      await writeFile(join(skillDir, 'index.ts'), generated.code, 'utf-8')
      files.push('index.ts')
    }

    const now = Date.now()
    const meta: SkillMeta = {
      id: skillId,
      name: generated.name,
      description: generated.description,
      version: '1.0.0',
      author: 'user',
      path: skillDir,
      tags: generated.tags,
      permissions: generated.permissions,
      level: 'full',
      active: true,
      installSource: 'local',
      installedAt: now,
      useCount: 0
    }

    this.logger.info(`技能已通过 AI 创建: ${skillId} (${generated.name})`)

    return { skillId, files, meta, skillMd: generated.skillMd }
  }

  /** 调用 AI 生成技能内容 */
  private async generateFromAI(description: string): Promise<{
    name: string
    description: string
    tags: string[]
    permissions: string[]
    skillMd: string
    code?: string
  }> {
    const prompt = [
      '请根据以下描述创建一个完整的技能：',
      '',
      description,
      '',
      '请生成：',
      '1. 技能名称（简洁明了）',
      '2. 技能描述（一句话）',
      '3. 标签列表',
      '4. 所需权限列表（从 file.read, file.write, network, exec, screen, clipboard, notification 中选择）',
      '5. 完整的 SKILL.md 内容',
      '6. TypeScript 代码骨架（index.ts）',
      '',
      '输出格式：',
      '===META===',
      'name: 技能名称',
      'description: 技能描述',
      'tags: tag1, tag2',
      'permissions: file.read, network',
      '===SKILL.md===',
      '(完整的 SKILL.md 内容，包含 frontmatter)',
      '===INDEX===',
      '(index.ts 代码)',
      '==='
    ].join('\n')

    try {
      const response = await this.ai.chat([
        {
          role: 'system',
          content: '你是一个技能创建专家。请根据用户的描述生成高质量的 SKILL.md 和 TypeScript 代码骨架。确保输出格式正确。'
        },
        { role: 'user', content: prompt }
      ])

      return this.parseAIResponse(response.message.content, description)
    } catch (err) {
      this.logger.warn('AI 生成技能失败，使用基础模板', err as Error)
      return this.generateFallback(description)
    }
  }

  /** 解析 AI 响应 */
  private parseAIResponse(content: string, fallbackDesc: string): {
    name: string
    description: string
    tags: string[]
    permissions: string[]
    skillMd: string
    code?: string
  } {
    // 提取 META
    const metaMatch = content.match(/===META===\s*\n([\s\S]*?)(?====SKILL\.md===|===)/)
    let name = '自定义技能'
    let description = fallbackDesc
    const tags: string[] = []
    const permissions: string[] = []

    if (metaMatch) {
      const metaLines = metaMatch[1].split('\n')
      for (const line of metaLines) {
        const nameMatch = line.match(/^name:\s*(.+)/)
        if (nameMatch) name = nameMatch[1].trim()

        const descMatch = line.match(/^description:\s*(.+)/)
        if (descMatch) description = descMatch[1].trim()

        const tagsMatch = line.match(/^tags:\s*(.+)/)
        if (tagsMatch) {
          tags.push(
            ...tagsMatch[1]
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          )
        }

        const permMatch = line.match(/^permissions:\s*(.+)/)
        if (permMatch) {
          permissions.push(
            ...permMatch[1]
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
          )
        }
      }
    }

    // 提取 SKILL.md
    const skillMdMatch = content.match(/===SKILL\.md===\s*\n([\s\S]*?)(?====INDEX===|===END===|===$)/)
    let skillMd = ''
    if (skillMdMatch) {
      skillMd = skillMdMatch[1].trim()
    }

    // 提取 INDEX
    const codeMatch = content.match(/===INDEX===\s*\n([\s\S]*?)(?====$|===END===)/)
    let code: string | undefined
    if (codeMatch) {
      code = codeMatch[1].trim()
    }

    // 如果没有解析到结构化内容，用整个响应作为 SKILL.md
    if (!skillMd && content.length > 50) {
      skillMd = content
    }

    // 确保 SKILL.md 有 frontmatter
    if (skillMd && !skillMd.startsWith('---')) {
      skillMd = [
        '---',
        `name: ${name}`,
        `description: ${description}`,
        'version: 1.0.0',
        'author: user',
        `tags: [${tags.join(', ')}]`,
        `permissions: [${permissions.join(', ')}]`,
        '---',
        '',
        skillMd
      ].join('\n')
    }

    return {
      name,
      description,
      tags: tags.length > 0 ? tags : ['自定义'],
      permissions: permissions.length > 0 ? permissions : [],
      skillMd: skillMd || this.generateBasicSkillMd(name, description, tags, permissions),
      code
    }
  }

  /** 降级：生成基础模板 */
  private generateFallback(description: string): {
    name: string
    description: string
    tags: string[]
    permissions: string[]
    skillMd: string
  } {
    const name = description.slice(0, 30) || '自定义技能'
    const tags = ['自定义']
    const permissions: string[] = []

    return {
      name,
      description,
      tags,
      permissions,
      skillMd: this.generateBasicSkillMd(name, description, tags, permissions)
    }
  }

  /** 生成基础 SKILL.md */
  private generateBasicSkillMd(
    name: string,
    description: string,
    tags: string[],
    permissions: string[]
  ): string {
    return [
      '---',
      `name: ${name}`,
      `description: ${description}`,
      'version: 1.0.0',
      'author: user',
      `tags: [${tags.join(', ')}]`,
      `permissions: [${permissions.join(', ')}]`,
      'level: full',
      '---',
      '',
      `# ${name}`,
      '',
      `> ${description}`,
      '',
      '## 使用方法',
      '',
      'TODO: 请补充使用说明',
      '',
      '## 注意事项',
      '',
      'TODO: 请补充注意事项',
      ''
    ].join('\n')
  }

  /** 生成技能 ID（kebab-case） */
  private generateId(name: string): string {
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '')
    return id || `skill-${Date.now()}`
  }
}
