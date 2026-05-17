import type { Logger } from '../../src/main/types/logger'
import type { Task, TaskStep } from './types'
import { TaskStatus } from './types'
import type { AIService } from '../../src/main/types/ai'

type TaskStatusValue = typeof TaskStatus[keyof typeof TaskStatus]

/**
 * 任务规划器 — 支持 AI 智能拆解和降级简单拆解
 * 接入 AI 服务后可自动将复杂任务拆解为结构化步骤
 */
export class TaskPlanner {
  private logger: Logger
  private ai: AIService | null

  constructor(logger: Logger, ai?: AIService) {
    this.logger = logger
    this.ai = ai ?? null
  }

  /**
   * 拆解任务为可执行步骤
   * 优先使用 AI 拆解，不可用时降级为简单拆解
   * @param taskName 任务名称
   * @param description 任务描述
   * @returns 拆解后的步骤列表
   */
  async plan(taskName: string, description: string): Promise<TaskStep[]> {
    this.logger.info(`规划任务: ${taskName}`)

    if (this.ai) {
      try {
        return await this.planWithAI(taskName, description)
      } catch (e) {
        this.logger.warn(`AI 拆解失败，降级为简单拆解: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return this.planSimple(taskName, description)
  }

  /**
   * 使用 AI 智能拆解任务
   * @param taskName 任务名称
   * @param description 任务描述
   * @returns AI 拆解的步骤列表
   */
  private async planWithAI(taskName: string, description: string): Promise<TaskStep[]> {
    if (!this.ai) throw new Error('AI 服务不可用')

    const prompt = `你是一个任务规划专家。请将以下任务拆解为具体的可执行步骤。

任务名称：${taskName}
任务描述：${description}

请以 JSON 数组格式返回步骤列表，每个步骤包含：
- name: 步骤名称（简短）
- description: 步骤详细描述
- toolName: 可能用到的工具名（可选）

只返回 JSON，不要其他内容。示例格式：
[{"name":"步骤1","description":"详细描述","toolName":"tool_name"}]`

    const response = await this.ai.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 2000 }
    )

    const content = response.message.content || ''
    // 提取 JSON 部分（可能被 markdown 代码块包裹）
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('AI 返回格式异常：未找到 JSON 数组')

    const aiSteps = JSON.parse(jsonMatch[0]) as Array<{
      name: string
      description: string
      toolName?: string
    }>

    if (!Array.isArray(aiSteps) || aiSteps.length === 0) {
      throw new Error('AI 返回的步骤列表为空')
    }

    const steps: TaskStep[] = aiSteps.map((s, i) => ({
      id: crypto.randomUUID(),
      name: s.name || `步骤${i + 1}`,
      description: s.description || '',
      status: TaskStatus.PENDING as TaskStatusValue,
      toolName: s.toolName,
      dependsOn: [],
      retryCount: 0,
      maxRetries: 3,
    }))

    // 设置串行依赖
    for (let i = 1; i < steps.length; i++) {
      steps[i].dependsOn = [steps[i - 1].id]
    }

    this.logger.info(`AI 拆解完成: ${steps.length} 个步骤`)
    return steps
  }

  /**
   * 简单拆解（降级方案）：按句号/分号分割
   * @param taskName 任务名称
   * @param description 任务描述
   * @returns 简单拆解的步骤列表
   */
  private planSimple(taskName: string, description: string): TaskStep[] {
    this.logger.info(`简单拆解任务: ${taskName}`)
    const sentences = description
      .split(/[。；;.!！]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    const steps: TaskStep[] = sentences.map((sentence, i) => ({
      id: crypto.randomUUID(),
      name: `步骤${i + 1}`,
      description: sentence,
      status: TaskStatus.PENDING as TaskStatusValue,
      dependsOn: [],
      retryCount: 0,
      maxRetries: 3,
    }))

    // 设置串行依赖
    for (let i = 1; i < steps.length; i++) {
      steps[i].dependsOn = [steps[i - 1].id]
    }

    this.logger.info(`简单拆解完成: ${steps.length} 个步骤`)
    return steps
  }

  /**
   * 创建任务（同步包装，内部调用异步 plan）
   * @param name 任务名称
   * @param description 任务描述
   * @returns 创建的任务对象
   */
  async createTask(name: string, description: string): Promise<Task> {
    const steps = await this.plan(name, description)
    return {
      id: crypto.randomUUID(),
      name,
      description,
      status: TaskStatus.PENDING as TaskStatusValue,
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }
}
