/**
 * 步骤执行器
 * 负责执行单个工作流步骤，包括：
 * - 模板参数替换（从上游步骤输出取值）
 * - 条件判断
 * - 调用其他模块的能力
 * - 错误处理与重试
 */
import type { ModuleContext } from '../../../src/main/types/module'
import type { Capability } from '../../../src/main/types/capability'
import type { Logger } from '../../../src/main/types/logger'
import type {
  WorkflowStep,
  StepResult,
  StepCondition,
  ConditionOperator,
  StepRunStatus
} from '../types'

/** 步骤执行上下文（包含上游步骤结果） */
export interface StepExecutionContext {
  /** 已执行步骤的输出，key 为 stepId */
  stepOutputs: Map<string, unknown>
  /** 工作流级别的覆盖参数 */
  overrides?: Record<string, unknown>
}

export class StepExecutor {
  private context: ModuleContext
  private logger: Logger
  private capabilities = new Map<string, Capability>()

  constructor(context: ModuleContext) {
    this.context = context
    this.logger = context.logger
  }

  /**
   * 刷新能力注册表
   * 遍历所有已激活模块，收集它们提供的能力
   */
  refreshCapabilities(): void {
    this.capabilities.clear()
    // 遍历已知模块名收集能力
    const moduleNames = ['tools', 'task', 'skill', 'ai', 'memory', 'vision', 'weather', 'clipboard', 'workflow']
    for (const name of moduleNames) {
      const mod = this.context.getModule(name)
      if (mod && typeof mod.getCapabilities === 'function') {
        try {
          const caps = mod.getCapabilities()
          for (const cap of caps) {
            this.capabilities.set(cap.name, cap)
          }
        } catch {
          // 模块可能未完全初始化，忽略
        }
      }
    }
  }

  /**
   * 执行单个步骤
   * @param step 步骤定义
   * @param execContext 执行上下文
   * @param timeoutMs 超时毫秒数
   */
  async execute(step: WorkflowStep, execContext: StepExecutionContext, timeoutMs = 30000): Promise<StepResult> {
    const startedAt = Date.now()

    // 1. 检查条件
    if (step.condition && !this.evaluateCondition(step.condition, execContext.stepOutputs)) {
      this.logger.info(`步骤 ${step.name} 条件不满足，跳过`)
      return {
        stepId: step.id,
        status: 'skipped',
        startedAt,
        finishedAt: Date.now()
      }
    }

    // 2. 构建参数（模板替换）
    const params = this.resolveParams(step, execContext)

    // 3. 查找能力
    const capability = this.capabilities.get(step.capability)
    if (!capability?.handler) {
      return {
        stepId: step.id,
        status: 'failed',
        error: `能力 ${step.capability} 未找到或不可用`,
        startedAt,
        finishedAt: Date.now()
      }
    }

    // 4. 执行（带超时和重试）
    const maxRetries = step.onError === 'retry' ? (step.maxRetries ?? 3) : 0
    let lastError: string | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.logger.info(`步骤 ${step.name} 第 ${attempt} 次重试`)
          // 重试间隔递增：1s, 2s, 3s...
          await this.delay(attempt * 1000)
        }

        const output = await this.executeWithTimeout(capability, params, timeoutMs)

        return {
          stepId: step.id,
          status: 'success',
          output,
          startedAt,
          finishedAt: Date.now()
        }
      } catch (err) {
        lastError = (err as Error).message ?? String(err)
        this.logger.warn(`步骤 ${step.name} 执行失败${attempt > 0 ? ` (重试 ${attempt})` : ''}: ${lastError}`)
      }
    }

    // 所有重试都失败
    return {
      stepId: step.id,
      status: 'failed',
      error: lastError,
      startedAt,
      finishedAt: Date.now()
    }
  }

  /**
   * 解析步骤参数（模板替换）
   * 支持 {{stepX.output}} 语法引用上游步骤输出
   */
  private resolveParams(step: WorkflowStep, execContext: StepExecutionContext): Record<string, unknown> {
    // 基础参数
    let params = { ...step.params }

    // 应用 inputMapping
    if (step.inputMapping) {
      for (const [paramKey, templateValue] of Object.entries(step.inputMapping)) {
        params[paramKey] = this.resolveTemplate(templateValue, execContext.stepOutputs)
      }
    }

    // 全局模板替换（递归处理 params 中所有字符串值）
    params = this.deepResolve(params, execContext.stepOutputs)

    // 应用覆盖参数
    if (execContext.overrides) {
      params = { ...params, ...execContext.overrides }
    }

    return params
  }

  /**
   * 递归解析对象中所有模板字符串
   */
  private deepResolve(obj: unknown, stepOutputs: Map<string, unknown>): unknown {
    if (typeof obj === 'string') {
      return this.resolveTemplate(obj, stepOutputs)
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepResolve(item, stepOutputs))
    }
    if (obj !== null && typeof obj === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        result[key] = this.deepResolve(value, stepOutputs)
      }
      return result
    }
    return obj
  }

  /**
   * 解析模板字符串中的 {{stepX.output}} 占位符
   */
  private resolveTemplate(template: string, stepOutputs: Map<string, unknown>): unknown {
    // 如果整个字符串就是一个模板表达式，直接返回值（保留类型）
    const singleMatch = template.match(/^{{(\w+)\.output}}$/)
    if (singleMatch) {
      const stepKey = singleMatch[1]
      return stepOutputs.get(stepKey) ?? template
    }

    // 否则做字符串替换
    return template.replace(/{{(\w+)\.output}}/g, (_, stepKey: string) => {
      const value = stepOutputs.get(stepKey)
      if (value === undefined) return `{{${stepKey}.output}}`
      return typeof value === 'string' ? value : JSON.stringify(value)
    })
  }

  /**
   * 评估条件
   */
  private evaluateCondition(condition: StepCondition, stepOutputs: Map<string, unknown>): boolean {
    // 从 field 中提取步骤引用
    const fieldMatch = condition.field.match(/^(\w+)\.output(?:\.(.+))?$/)
    let fieldValue: unknown

    if (fieldMatch) {
      const stepKey = fieldMatch[1]
      const subPath = fieldMatch[2]
      fieldValue = stepOutputs.get(stepKey)
      if (subPath && fieldValue !== undefined && typeof fieldValue === 'object') {
        // 支持简单的嵌套路径 a.b.c
        const parts = subPath.split('.')
        let current: unknown = fieldValue
        for (const part of parts) {
          if (current === null || current === undefined || typeof current !== 'object') {
            return false
          }
          current = (current as Record<string, unknown>)[part]
        }
        fieldValue = current
      }
    } else {
      // 尝试直接从 stepOutputs 取
      fieldValue = stepOutputs.get(condition.field)
    }

    return this.compareValues(fieldValue, condition.operator, condition.value)
  }

  /**
   * 值比较
   */
  private compareValues(actual: unknown, operator: ConditionOperator, expected: unknown): boolean {
    switch (operator) {
      case 'eq':
        return actual === expected
      case 'ne':
        return actual !== expected
      case 'contains':
        if (typeof actual === 'string' && typeof expected === 'string') {
          return actual.includes(expected)
        }
        if (Array.isArray(actual)) {
          return actual.includes(expected)
        }
        return false
      case 'gt':
        return Number(actual) > Number(expected)
      case 'lt':
        return Number(actual) < Number(expected)
      default:
        return false
    }
  }

  /**
   * 带超时的能力执行
   */
  private async executeWithTimeout(
    capability: Capability,
    params: Record<string, unknown>,
    timeoutMs: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`步骤执行超时 (${timeoutMs}ms)`))
      }, timeoutMs)

      capability.handler!.execute(params).then(
        (result) => {
          clearTimeout(timer)
          if (result.success) {
            resolve(result.data)
          } else {
            reject(new Error(result.error ?? '能力执行失败'))
          }
        },
        (err) => {
          clearTimeout(timer)
          reject(err)
        }
      )
    })
  }

  /**
   * 延迟工具
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
