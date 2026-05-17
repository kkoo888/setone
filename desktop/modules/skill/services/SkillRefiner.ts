/**
 * 炼化优化引擎
 * 对已有技能进行 AI 分析和迭代优化
 */
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Logger } from '../../../src/main/types/logger'
import type { AIService } from '../../../src/main/types/ai'
import type { SkillMeta } from '../types'

/** 分析结果 */
export interface AnalyzeResult {
  suggestions: string[]
  score: number
  summary: string
}

/** 炼化结果 */
export interface RefineResult {
  before: string
  after: string
  changes: string[]
}

/**
 * 技能炼化优化引擎
 * 提供 AI 分析、优化建议、迭代炼化能力
 */
export class SkillRefiner {
  private logger: Logger
  private ai: AIService

  constructor(logger: Logger, ai: AIService) {
    this.logger = logger
    this.ai = ai
  }

  /**
   * 分析技能，生成优化建议
   * @param skillId - 技能 ID
   * @param skillPath - 技能目录路径
   * @param meta - 技能元数据
   * @returns 分析结果（建议列表、评分、摘要）
   */
  async analyze(
    skillId: string,
    skillPath: string,
    meta: SkillMeta
  ): Promise<AnalyzeResult> {
    const content = await this.readSkillMd(skillPath)

    if (!content) {
      return {
        suggestions: ['未找到 SKILL.md 文件，建议先创建技能内容'],
        score: 0,
        summary: '技能内容为空'
      }
    }

    const prompt = this.buildAnalyzePrompt(content, meta)

    try {
      const response = await this.ai.chat([
        { role: 'system', content: this.getAnalyzeSystemPrompt() },
        { role: 'user', content: prompt }
      ])

      return this.parseAnalyzeResponse(response.message.content)
    } catch (err) {
      this.logger.error(`AI 分析技能 ${skillId} 失败`, err as Error)
      return {
        suggestions: ['AI 分析暂时不可用，请稍后重试'],
        score: 0,
        summary: '分析失败'
      }
    }
  }

  /**
   * 根据指令优化技能
   * @param skillId - 技能 ID
   * @param skillPath - 技能目录路径
   * @param meta - 技能元数据
   * @param instruction - 用户优化指令
   * @returns 炼化结果（优化前后内容、变更列表）
   */
  async refine(
    skillId: string,
    skillPath: string,
    meta: SkillMeta,
    instruction: string
  ): Promise<RefineResult> {
    const before = await this.readSkillMd(skillPath)

    if (!before) {
      return {
        before: '',
        after: '',
        changes: ['技能内容为空，无法优化']
      }
    }

    const prompt = this.buildRefinePrompt(before, instruction, meta)

    try {
      const response = await this.ai.chat([
        { role: 'system', content: this.getRefineSystemPrompt() },
        { role: 'user', content: prompt }
      ])

      const parsed = this.parseRefineResponse(response.message.content, before)

      // 写入优化后的 SKILL.md
      if (parsed.after && parsed.after !== before) {
        await writeFile(join(skillPath, 'SKILL.md'), parsed.after, 'utf-8')
        this.logger.info(`技能 ${skillId} 已炼化优化`)
      }

      return parsed
    } catch (err) {
      this.logger.error(`AI 炼化技能 ${skillId} 失败`, err as Error)
      return {
        before,
        after: before,
        changes: ['AI 炼化暂时不可用，请稍后重试']
      }
    }
  }

  /** 读取 SKILL.md 内容 */
  private async readSkillMd(skillPath: string): Promise<string> {
    try {
      return await readFile(join(skillPath, 'SKILL.md'), 'utf-8')
    } catch {
      return ''
    }
  }

  /** 构建分析提示词 */
  private buildAnalyzePrompt(content: string, meta: SkillMeta): string {
    return [
      '请分析以下技能的质量并给出优化建议：',
      '',
      `技能名称：${meta.name}`,
      `技能描述：${meta.description}`,
      `版本：${meta.version}`,
      `标签：${meta.tags.join(', ')}`,
      `权限：${meta.permissions.join(', ')}`,
      '',
      '当前 SKILL.md 内容：',
      '```markdown',
      content,
      '```',
      '',
      '请从以下维度分析：',
      '1. 描述清晰度',
      '2. 使用说明完整性',
      '3. 权限声明合理性',
      '4. 结构规范性',
      '5. 可改进之处',
      '',
      '请按指定 JSON 格式输出分析结果。'
    ].join('\n')
  }

  /** 构建炼化提示词 */
  private buildRefinePrompt(content: string, instruction: string, meta: SkillMeta): string {
    return [
      '请根据以下指令优化这个技能的 SKILL.md：',
      '',
      `技能名称：${meta.name}`,
      `优化指令：${instruction}`,
      '',
      '当前 SKILL.md：',
      '```markdown',
      content,
      '```',
      '',
      '请输出优化后的完整 SKILL.md 内容，以及变更说明列表。',
      '输出格式：',
      '===CHANGES===',
      '- 变更1',
      '- 变更2',
      '===SKILL.md===',
      '(完整优化后的 SKILL.md 内容)',
      '==='
    ].join('\n')
  }

  /** 获取分析系统提示词 */
  private getAnalyzeSystemPrompt(): string {
    return [
      '你是一个技能质量分析专家。请客观评估技能的质量并给出具体可操作的优化建议。',
      '',
      '请以 JSON 格式输出：',
      '```json',
      '{',
      '  "suggestions": ["建议1", "建议2", ...],',
      '  "score": 0-100,',
      '  "summary": "一句话总结"',
      '}',
      '```'
    ].join('\n')
  }

  /** 获取炼化系统提示词 */
  private getRefineSystemPrompt(): string {
    return [
      '你是一个技能优化专家。请根据用户的指令改进技能的 SKILL.md 内容。',
      '保持原有内容的精华，只做有针对性的改进。',
      '',
      '输出格式：',
      '===CHANGES===',
      '- 变更说明1',
      '- 变更说明2',
      '===SKILL.md===',
      '(完整的优化后 SKILL.md)',
      '==='
    ].join('\n')
  }

  /** 解析分析响应 */
  private parseAnalyzeResponse(content: string): AnalyzeResult {
    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/```json\s*\n([\s\S]*?)\n```/)
      const jsonStr = jsonMatch ? jsonMatch[1] : content
      const parsed = JSON.parse(jsonStr)

      return {
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        score: typeof parsed.score === 'number' ? parsed.score : 0,
        summary: typeof parsed.summary === 'string' ? parsed.summary : '分析完成'
      }
    } catch {
      // JSON 解析失败，尝试提取建议列表
      const suggestions = content
        .split('\n')
        .filter((line) => /^\d+[\.\)、]/.test(line.trim()) || line.trim().startsWith('- '))
        .map((line) => line.replace(/^[\d\.\)\-\s、]+/, '').trim())
        .filter(Boolean)

      return {
        suggestions: suggestions.length > 0 ? suggestions : ['分析结果解析失败，请重试'],
        score: 0,
        summary: '分析完成（解析异常）'
      }
    }
  }

  /** 解析炼化响应 */
  private parseRefineResponse(content: string, before: string): RefineResult {
    const changes: string[] = []
    let after = before

    // 提取变更说明
    const changesMatch = content.match(/===CHANGES===\s*\n([\s\S]*?)(?====SKILL\.md===|===)/)
    if (changesMatch) {
      changes.push(
        ...changesMatch[1]
          .split('\n')
          .map((line) => line.replace(/^[\-\*\d\.\)\s]+/, '').trim())
          .filter(Boolean)
      )
    }

    // 提取优化后的 SKILL.md
    const skillMdMatch = content.match(/===SKILL\.md===\s*\n([\s\S]*?)(?====$|$)/)
    if (skillMdMatch) {
      after = skillMdMatch[1].trim()
    }

    // 如果没有结构化输出，尝试整体作为 SKILL.md
    if (changes.length === 0 && after === before && content.length > 50) {
      // 检查是否是有效的 markdown
      if (content.includes('# ') || content.includes('---')) {
        after = content.replace(/===CHANGES===[\s\S]*?===SKILL\.md===/g, '').trim()
        changes.push('内容已优化')
      }
    }

    return { before, after, changes }
  }
}
