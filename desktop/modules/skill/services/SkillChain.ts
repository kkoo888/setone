import { randomUUID } from 'crypto'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { Logger } from '../../../src/main/types/logger'

/** 工作流步骤 */
export interface WorkflowStep {
  skillId: string
  params?: Record<string, unknown>
  condition?: string
}

/** 工作流定义 */
export interface SkillWorkflow {
  id: string
  name: string
  description: string
  steps: WorkflowStep[]
  createdAt: number
}

/** 工作流执行结果 */
export interface WorkflowResult {
  success: boolean
  results: unknown[]
  error?: string
}

/** 工作流数据文件结构 */
interface WorkflowFile {
  workflows: SkillWorkflow[]
}

/**
 * 技能组合执行器
 * 将多个技能串联成工作流，按顺序执行
 */
export class SkillChain {
  private workflows: Map<string, SkillWorkflow> = new Map()
  private filePath: string
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  /** 清理定时器（模块停用时调用） */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
  }

  constructor(
    private logger: Logger,
    private skillsDir: string
  ) {
    this.filePath = `${skillsDir}/.workflows.json`
  }

  /** 初始化：从文件加载工作流 */
  async init(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8')
      const data = JSON.parse(content) as WorkflowFile
      for (const wf of data.workflows) {
        this.workflows.set(wf.id, wf)
      }
      this.logger.info(`已加载 ${this.workflows.size} 个工作流`)
    } catch {
      // 文件不存在，从空开始
      this.workflows = new Map()
    }
  }

  /** 创建工作流 */
  async createWorkflow(
    name: string,
    steps: WorkflowStep[],
    description = ''
  ): Promise<SkillWorkflow> {
    const workflow: SkillWorkflow = {
      id: randomUUID(),
      name,
      description,
      steps,
      createdAt: Date.now()
    }
    this.workflows.set(workflow.id, workflow)
    await this.save()
    this.logger.info(`创建工作流: ${name} (${workflow.id}), ${steps.length} 个步骤`)
    return workflow
  }

  /** 更新工作流 */
  async updateWorkflow(
    id: string,
    updates: Partial<Pick<SkillWorkflow, 'name' | 'description' | 'steps'>>
  ): Promise<boolean> {
    const workflow = this.workflows.get(id)
    if (!workflow) return false

    if (updates.name !== undefined) workflow.name = updates.name
    if (updates.description !== undefined) workflow.description = updates.description
    if (updates.steps !== undefined) workflow.steps = updates.steps

    await this.save()
    this.logger.info(`更新工作流: ${id}`)
    return true
  }

  /** 执行工作流 */
  async execute(
    workflowId: string,
    input?: unknown,
    skillExecutor?: (skillId: string, params?: Record<string, unknown>, input?: unknown) => Promise<unknown>
  ): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      return { success: false, results: [], error: `工作流 ${workflowId} 不存在` }
    }

    this.logger.info(`开始执行工作流: ${workflow.name} (${workflowId})`)
    const results: unknown[] = []
    let currentInput = input

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i]

      // 条件检查（如果有条件表达式）
      if (step.condition) {
        try {
          const shouldExecute = this.evaluateCondition(step.condition, currentInput, results)
          if (!shouldExecute) {
            this.logger.info(`步骤 ${i + 1} (${step.skillId}) 条件不满足，跳过`)
            results.push({ skipped: true, reason: 'condition not met' })
            continue
          }
        } catch (err) {
          this.logger.warn(`步骤 ${i + 1} 条件评估失败: ${(err as Error).message}`)
        }
      }

      this.logger.info(`执行步骤 ${i + 1}/${workflow.steps.length}: ${step.skillId}`)

      try {
        let result: unknown
        if (skillExecutor) {
          result = await skillExecutor(step.skillId, step.params, currentInput)
        } else {
          // 无执行器时返回模拟结果
          result = { simulated: true, skillId: step.skillId, params: step.params, input: currentInput }
        }
        results.push(result)
        currentInput = result
      } catch (err) {
        const errorMsg = (err as Error).message
        this.logger.error(`步骤 ${i + 1} (${step.skillId}) 执行失败`, err as Error)
        results.push({ error: errorMsg, skillId: step.skillId })
        return { success: false, results, error: `步骤 ${i + 1} (${step.skillId}) 失败: ${errorMsg}` }
      }
    }

    this.logger.info(`工作流 ${workflow.name} 执行完成`)
    return { success: true, results }
  }

  /** 简单条件评估 */
  private evaluateCondition(condition: string, input: unknown, results: unknown[]): boolean {
    // 支持简单表达式：
    // "input.exists" - 输入存在
    // "result[N].success" - 第N步结果成功
    // "true" / "false"
    if (condition === 'true') return true
    if (condition === 'false') return false
    if (condition === 'input.exists') return input !== undefined && input !== null

    const resultMatch = condition.match(/^result\[(\d+)\]\.(\w+)$/)
    if (resultMatch) {
      const idx = parseInt(resultMatch[1], 10)
      const prop = resultMatch[2]
      if (idx < results.length && results[idx] !== null && typeof results[idx] === 'object') {
        return (results[idx] as Record<string, unknown>)[prop] === true
      }
      return false
    }

    // 默认返回 true
    return true
  }

  /** 列出所有工作流 */
  listWorkflows(): SkillWorkflow[] {
    return Array.from(this.workflows.values())
  }

  /** 获取单个工作流 */
  getWorkflow(id: string): SkillWorkflow | undefined {
    return this.workflows.get(id)
  }

  /** 删除工作流 */
  async deleteWorkflow(id: string): Promise<boolean> {
    if (!this.workflows.has(id)) return false
    this.workflows.delete(id)
    await this.save()
    this.logger.info(`删除工作流: ${id}`)
    return true
  }

  /** 保存到文件 */
  private async save(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => { void this.doSave() }, 300)
  }

  private async doSave(): Promise<void> {
    try {
      const dir = dirname(this.filePath)
      await mkdir(dir, { recursive: true })
      const data: WorkflowFile = {
        workflows: Array.from(this.workflows.values())
      }
      await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      this.logger.error('保存工作流数据失败', err as Error)
    }
  }
}
