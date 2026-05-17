/**
 * 工作流执行引擎
 * 负责编排和执行完整的工作流，管理运行状态和日志
 */
import { randomUUID } from 'crypto'
import type { ModuleContext } from '../../../src/main/types/module'
import type { Logger } from '../../../src/main/types/logger'
import type {
  Workflow,
  WorkflowRun,
  WorkflowRunStatus,
  StepResult
} from '../types'
import { WorkflowStore } from './WorkflowStore'
import { StepExecutor, type StepExecutionContext } from './StepExecutor'

/** 正在运行的工作流引用 */
interface RunningWorkflow {
  run: WorkflowRun
  aborted: boolean
}

export class WorkflowEngine {
  private context: ModuleContext
  private logger: Logger
  private store: WorkflowStore
  private stepExecutor: StepExecutor
  private running = new Map<string, RunningWorkflow>()
  private executionTimeout: number

  constructor(context: ModuleContext, store: WorkflowStore) {
    this.context = context
    this.logger = context.logger
    this.store = store
    this.stepExecutor = new StepExecutor(context)

    // 从 settings 读取超时配置
    const settings = (context.config as Record<string, unknown>).settings as Record<string, unknown> | undefined
    this.executionTimeout = (settings?.executionTimeout as number) ?? 300000
  }

  /**
   * 执行工作流
   * @param workflow 工作流定义
   * @param overrides 可选覆盖参数
   * @returns 运行记录
   */
  async execute(workflow: Workflow, overrides?: Record<string, unknown>): Promise<WorkflowRun> {
    // 刷新能力注册表
    this.stepExecutor.refreshCapabilities()

    const runId = randomUUID()
    const startedAt = Date.now()

    // 创建运行记录
    const run: WorkflowRun = {
      id: runId,
      workflowId: workflow.id,
      startedAt,
      status: 'running',
      stepResults: []
    }

    // 注册到运行中列表
    const runningRef: RunningWorkflow = { run, aborted: false }
    this.running.set(runId, runningRef)

    // 持久化初始记录
    await this.store.saveRun(run)

    this.logger.info(`开始执行工作流: ${workflow.name} (runId: ${runId})`)

    try {
      // 按 order 排序步骤
      const sortedSteps = [...workflow.steps].sort((a, b) => a.order - b.order)

      const execContext: StepExecutionContext = {
        stepOutputs: new Map(),
        overrides
      }

      // 全局超时
      const globalTimeout = this.createGlobalTimeout(runId)

      // 顺序执行步骤
      for (const step of sortedSteps) {
        // 检查是否被中止
        if (runningRef.aborted) {
          run.status = 'paused'
          run.error = '工作流已暂停'
          break
        }

        const stepResult = await this.stepExecutor.execute(step, execContext, 30000)
        run.stepResults.push(stepResult)

        // 持久化中间结果
        await this.store.saveRun(run)

        // 记录输出到上下文（即使失败也可能有部分输出）
        if (stepResult.output !== undefined) {
          // 使用 stepN 格式作为 key
          const stepKey = `step${step.order}`
          execContext.stepOutputs.set(stepKey, stepResult.output)
          // 同时用 stepId 作为 key
          execContext.stepOutputs.set(step.id, stepResult.output)
        }

        // 步骤失败且策略为 stop
        if (stepResult.status === 'failed' && step.onError === 'stop') {
          run.status = 'failed'
          run.error = `步骤 "${step.name}" 失败: ${stepResult.error}`
          break
        }
      }

      // 如果不是失败/暂停，则标记成功
      if (run.status === 'running') {
        run.status = 'success'
      }

      clearTimeout(globalTimeout)
    } catch (err) {
      run.status = 'failed'
      run.error = (err as Error).message ?? String(err)
      this.logger.error(`工作流 ${workflow.name} 执行异常: ${run.error}`)
    }

    // 完成
    run.finishedAt = Date.now()
    this.running.delete(runId)

    // 持久化最终结果
    await this.store.saveRun(run)

    // 更新工作流统计
    await this.store.updateWorkflowRunCount(
      workflow.id,
      workflow.runCount + 1,
      run.finishedAt
    )

    // 发送事件
    this.context.eventBus.emit('workflow:completed' as never, {
      workflowId: workflow.id,
      runId: run.id,
      status: run.status
    } as never)

    this.logger.info(
      `工作流 ${workflow.name} 执行完成: ${run.status}，耗时 ${run.finishedAt - run.startedAt}ms`
    )

    return run
  }

  /**
   * 暂停正在运行的工作流
   */
  pause(runId: string): boolean {
    const ref = this.running.get(runId)
    if (!ref) return false
    ref.aborted = true
    ref.run.status = 'paused'
    this.logger.info(`工作流已请求暂停: runId=${runId}`)
    return true
  }

  /**
   * 获取所有正在运行的工作流
   */
  getRunning(): WorkflowRun[] {
    return Array.from(this.running.values()).map((r) => r.run)
  }

  /**
   * 创建全局超时定时器
   */
  private createGlobalTimeout(runId: string): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      const ref = this.running.get(runId)
      if (ref && ref.run.status === 'running') {
        ref.aborted = true
        ref.run.status = 'failed'
        ref.run.error = `工作流执行超时 (${this.executionTimeout}ms)`
        this.logger.warn(`工作流执行超时: runId=${runId}`)
      }
    }, this.executionTimeout)
  }
}
