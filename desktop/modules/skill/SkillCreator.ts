import { mkdir, writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import type { Logger } from '../../src/main/types/logger'
import type { AIService } from '../../src/main/types/ai'
import type { SkillMeta, CreateSkillParams, Permission } from './types'

/** 技能模板类型 */
type TemplateType = 'blank' | 'from-existing'

/**
 * AI 辅助创建技能引擎
 * 根据用户描述生成 SKILL.md 和代码骨架
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
   * 创建新技能
   * @param params - 创建参数
   * @returns 创建的技能元数据
   */
  async create(params: CreateSkillParams): Promise<SkillMeta> {
    const id = this.generateId(params.name)
    const skillDir = join(this.skillsDir, id)

    // 确保目录存在
    await mkdir(skillDir, { recursive: true })

    // 生成 SKILL.md
    const skillMd = await this.generateSkillMd(params)
    await writeFile(join(skillDir, 'SKILL.md'), skillMd, 'utf-8')

    // 生成代码骨架
    const codeSkeleton = await this.generateCodeSkeleton(params)
    await writeFile(join(skillDir, 'index.ts'), codeSkeleton, 'utf-8')

    // 如果有 AI 指令，生成增强内容
    if (params.aiInstruction) {
      const enhanced = await this.generateWithAI(params, skillMd)
      if (enhanced) {
        await writeFile(join(skillDir, 'SKILL.md'), enhanced.skillMd, 'utf-8')
        if (enhanced.code) {
          await writeFile(join(skillDir, 'index.ts'), enhanced.code, 'utf-8')
        }
      }
    }

    const now = Date.now()
    const meta: SkillMeta = {
      id,
      name: params.name,
      description: params.description,
      version: '1.0.0',
      author: 'user',
      path: skillDir,
      tags: params.tags,
      permissions: params.permissions,
      level: 'full',
      active: true,
      installSource: 'local',
      installedAt: now,
      useCount: 0
    }

    this.logger.info(`技能已创建: ${id} (${params.name})`)
    return meta
  }

  /** 炼化优化已有技能 */
  async refine(
    currentContent: string,
    instruction: string,
    meta: SkillMeta
  ): Promise<{ skillMd: string; code?: string }> {
    const prompt = this.buildRefinePrompt(currentContent, instruction, meta)

    try {
      const response = await this.ai.chat([
        { role: 'system', content: this.getRefineSystemPrompt() },
        { role: 'user', content: prompt }
      ])

      const parsed = this.parseAIResponse(response.message.content)
      return {
        skillMd: parsed.skillMd ?? currentContent,
        code: parsed.code
      }
    } catch (err) {
      this.logger.error('AI 炼化失败', err as Error)
      return { skillMd: currentContent }
    }
  }

  /** 生成技能 ID（kebab-case） */
  private generateId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '')
      || `skill-${Date.now()}`
  }

  /** 生成 SKILL.md 内容 */
  private async generateSkillMd(params: CreateSkillParams): Promise<string> {
    const frontmatter = [
      '---',
      `name: ${params.name}`,
      `description: ${params.description}`,
      'version: 1.0.0',
      'author: user',
      `tags: [${params.tags.join(', ')}]`,
      `permissions: [${params.permissions.join(', ')}]`,
      'level: full',
      '---'
    ].join('\n')

    const body = [
      '',
      `# ${params.name}`,
      '',
      `> ${params.description}`,
      '',
      '## 使用方法',
      '',
      'TODO: 描述如何使用此技能',
      '',
      '## 权限说明',
      '',
      ...params.permissions.map((p) => `- \`${p}\`: ${this.getPermissionDescription(p)}`),
      ''
    ].join('\n')

    return frontmatter + body
  }

  /** 生成代码骨架 */
  private async generateCodeSkeleton(params: CreateSkillParams): Promise<string> {
    const imports = this.generateImports(params.permissions)
    const handlerBody = this.generateHandlerBody(params)

    return [
      '/**',
      ` * ${params.name}`,
      ` * ${params.description}`,
      ' */',
      imports,
      '',
      'export default {',
      `  name: '${params.name}',`,
      `  description: '${params.description}',`,
      '',
      '  async execute(params) {',
      handlerBody,
      '  }',
      '}',
      ''
    ].join('\n')
  }

  /** 根据权限生成 import 语句 */
  private generateImports(permissions: Permission[]): string {
    const imports: string[] = []

    if (permissions.includes('file.read') || permissions.includes('file.write')) {
      imports.push("import { readFile, writeFile } from 'fs/promises'")
    }
    if (permissions.includes('network')) {
      imports.push("// import fetch from 'node-fetch'")
    }
    if (permissions.includes('exec')) {
      imports.push("import { exec } from 'child_process'")
    }

    return imports.join('\n')
  }

  /** 生成处理函数体 */
  private generateHandlerBody(params: CreateSkillParams): string {
    const lines: string[] = ['    // TODO: 实现技能逻辑']

    if (params.permissions.includes('file.read')) {
      lines.push('    // const content = await readFile(params.path, \'utf-8\')')
    }
    if (params.permissions.includes('network')) {
      lines.push('    // const response = await fetch(params.url)')
    }
    if (params.permissions.includes('exec')) {
      lines.push('    // const { stdout } = await execPromise(params.command)')
    }

    lines.push('    return { success: true, message: \'技能执行完成\' }')
    return lines.join('\n')
  }

  /** 获取权限描述 */
  private getPermissionDescription(permission: Permission): string {
    const descriptions: Record<Permission, string> = {
      'file.read': '读取本地文件',
      'file.write': '写入/修改本地文件',
      'network': '发起网络请求',
      'exec': '执行系统命令',
      'screen': '截屏或录屏',
      'clipboard': '访问剪贴板',
      'notification': '发送系统通知'
    }
    return descriptions[permission] ?? '未知权限'
  }

  /** 使用 AI 生成增强内容 */
  private async generateWithAI(
    params: CreateSkillParams,
    basicSkillMd: string
  ): Promise<{ skillMd: string; code?: string } | null> {
    const prompt = this.buildCreatePrompt(params, basicSkillMd)

    try {
      const response = await this.ai.chat([
        { role: 'system', content: this.getCreateSystemPrompt() },
        { role: 'user', content: prompt }
      ])

      return this.parseAIResponse(response.message.content)
    } catch (err) {
      this.logger.warn('AI 生成增强内容失败，使用基础模板', err as Error)
      return null
    }
  }

  /** 构建创建时的 AI 提示 */
  private buildCreatePrompt(params: CreateSkillParams, basicSkillMd: string): string {
    return [
      '请根据以下信息生成一个完整的技能：',
      '',
      `名称：${params.name}`,
      `描述：${params.description}`,
      `标签：${params.tags.join(', ')}`,
      `权限：${params.permissions.join(', ')}`,
      params.aiInstruction ? `用户指令：${params.aiInstruction}` : '',
      '',
      '基础 SKILL.md：',
      '```markdown',
      basicSkillMd,
      '```',
      '',
      '请生成改进后的 SKILL.md 和 index.ts 代码。'
    ].filter(Boolean).join('\n')
  }

  /** 构建炼化时的 AI 提示 */
  private buildRefinePrompt(currentContent: string, instruction: string, meta: SkillMeta): string {
    return [
      '请根据以下指令优化这个技能：',
      '',
      `当前技能：${meta.name}`,
      `优化指令：${instruction}`,
      '',
      '当前 SKILL.md：',
      '```markdown',
      currentContent,
      '```',
      '',
      '请生成优化后的 SKILL.md 和（如有必要）index.ts 代码。'
    ].join('\n')
  }

  /** 获取创建时的系统提示 */
  private getCreateSystemPrompt(): string {
    return [
      '你是一个技能创建助手。请根据用户的描述生成高质量的 SKILL.md 和 TypeScript 代码骨架。',
      '输出格式：',
      '===SKILL.md===',
      '(SKILL.md 内容)',
      '===INDEX===',
      '(index.ts 内容)',
      '===END==='
    ].join('\n')
  }

  /** 获取炼化时的系统提示 */
  private getRefineSystemPrompt(): string {
    return [
      '你是一个技能优化助手。请根据用户的指令改进现有的技能。',
      '输出格式：',
      '===SKILL.md===',
      '(改进后的 SKILL.md 内容)',
      '===INDEX===',
      '(改进后的 index.ts 内容，如有必要)',
      '===END==='
    ].join('\n')
  }

  /** 解析 AI 响应，提取 SKILL.md 和代码 */
  private parseAIResponse(content: string): { skillMd?: string; code?: string } {
    const result: { skillMd?: string; code?: string } = {}

    const skillMdMatch = content.match(/===SKILL\.md===\s*\n([\s\S]*?)(?====INDEX===|===END===)/)
    if (skillMdMatch) {
      result.skillMd = skillMdMatch[1].trim()
    }

    const codeMatch = content.match(/===INDEX===\s*\n([\s\S]*?)(?====END===)/)
    if (codeMatch) {
      result.code = codeMatch[1].trim()
    }

    return result
  }
}
