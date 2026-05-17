/**
 * 工作流模块类型定义
 * 涵盖工作流、触发器、步骤、运行记录、模板等完整类型体系
 */

/** 工作流触发器类型 */
export type TriggerType = 'manual' | 'cron' | 'event' | 'hotkey'

/** 步骤错误处理策略 */
export type StepErrorAction = 'stop' | 'skip' | 'retry'

/** 工作流运行状态 */
export type WorkflowRunStatus = 'running' | 'success' | 'failed' | 'paused'

/** 步骤执行状态 */
export type StepRunStatus = 'success' | 'failed' | 'skipped'

/** 条件运算符 */
export type ConditionOperator = 'eq' | 'ne' | 'contains' | 'gt' | 'lt'

/** 工作流触发器定义 */
export interface WorkflowTrigger {
  type: TriggerType
  cron?: string
  event?: string
  hotkey?: string
}

/** 步骤条件判断 */
export interface StepCondition {
  field: string
  operator: ConditionOperator
  value: unknown
}

/** 工作流步骤定义 */
export interface WorkflowStep {
  id: string
  order: number
  name: string
  /** 调用的能力名 */
  capability: string
  params: Record<string, unknown>
  /** 从上游步骤取值，key 为当前步骤的 param key，value 为模板字符串如 {{step1.output}} */
  inputMapping?: Record<string, string>
  /** 条件判断：满足条件才执行该步骤 */
  condition?: StepCondition
  /** 错误处理策略 */
  onError: StepErrorAction
  /** 最大重试次数（仅 onError='retry' 时生效） */
  maxRetries?: number
}

/** 工作流定义 */
export interface Workflow {
  id: string
  name: string
  description: string
  enabled: boolean
  trigger: WorkflowTrigger
  steps: WorkflowStep[]
  createdAt: number
  lastRunAt?: number
  runCount: number
}

/** 工作流运行记录 */
export interface WorkflowRun {
  id: string
  workflowId: string
  startedAt: number
  finishedAt?: number
  status: WorkflowRunStatus
  stepResults: StepResult[]
  error?: string
}

/** 步骤执行结果 */
export interface StepResult {
  stepId: string
  status: StepRunStatus
  output?: unknown
  error?: string
  startedAt: number
  finishedAt: number
}

/** 工作流模板 */
export interface WorkflowTemplate {
  name: string
  description: string
  trigger: WorkflowTrigger
  steps: Array<Omit<WorkflowStep, 'id' | 'order' | 'onError'> & { onError?: StepErrorAction }>
}

/** 工作流创建参数 */
export interface CreateWorkflowParams {
  name: string
  description?: string
  trigger: WorkflowTrigger
  steps: Array<Omit<WorkflowStep, 'id' | 'order'>>
}

/** 工作流执行参数 */
export interface ExecuteWorkflowParams {
  workflowId: string
  /** 可选的运行时覆盖参数 */
  overrides?: Record<string, unknown>
}

/** 工作流列表参数 */
export interface ListWorkflowParams {
  enabled?: boolean
  triggerType?: TriggerType
}

/** 工作流日志查询参数 */
export interface WorkflowLogParams {
  workflowId?: string
  status?: WorkflowRunStatus
  limit?: number
  offset?: number
}

/** Cron 解析结果 */
export interface CronParsed {
  minute: number[]
  hour: number[]
  dayOfMonth: number[]
  month: number[]
  dayOfWeek: number[]
}

/** 内置模板列表 */
export const TEMPLATES: WorkflowTemplate[] = [
  {
    name: '每日日报',
    description: '聚合今日工作生成日报',
    trigger: { type: 'cron', cron: '0 18 * * *' },
    steps: [
      { name: '获取今日任务', capability: 'task_list', params: { filter: 'today' } },
      { name: 'AI生成日报', capability: 'ai_chat', params: { prompt: '根据以下任务生成日报: {{step1.output}}' } },
      { name: '复制到剪贴板', capability: 'clipboard_write', params: { content: '{{step2.output}}' } }
    ]
  },
  {
    name: '文件备份',
    description: '备份指定目录到目标位置',
    trigger: { type: 'cron', cron: '0 2 * * *' },
    steps: [
      { name: '获取文件列表', capability: 'file_list', params: {} },
      { name: '执行备份', capability: 'file_copy', params: { files: '{{step1.output}}' } }
    ]
  },
  {
    name: '代码审查',
    description: 'AI审查当前文件',
    trigger: { type: 'manual' },
    steps: [
      { name: '读取文件', capability: 'file_read', params: {} },
      { name: 'AI审查', capability: 'ai_chat', params: { prompt: '审查以下代码: {{step1.output}}' } }
    ]
  }
]
