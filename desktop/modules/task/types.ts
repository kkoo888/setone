export const TaskStatus = { PENDING: 'pending', PLANNING: 'planning', EXECUTING: 'executing', PAUSED: 'paused', COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled' } as const
export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus]

export interface TaskStep {
  id: string
  name: string
  description: string
  status: TaskStatusValue
  toolName?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: string
  dependsOn: string[]
  retryCount: number
  maxRetries: number
}

export interface Task {
  id: string
  name: string
  description: string
  status: TaskStatusValue
  steps: TaskStep[]
  createdAt: number
  updatedAt: number
  completedAt?: number
}
