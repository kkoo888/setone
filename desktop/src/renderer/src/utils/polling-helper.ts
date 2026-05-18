/**
 * 渲染进程轮询注册辅助
 * 让渲染进程的模块也能注册到主进程的轮询注册中心
 */

/** 注册轮询任务 */
export async function registerPolling(task: {
  id: string
  module: string
  description: string
  intervalMs: number
  status?: 'running' | 'paused' | 'stopped'
}): Promise<void> {
  try {
    await window.electronAPI.invoke('polling:register', {
      ...task,
      status: task.status ?? 'running',
    })
  } catch { /* ignore */ }
}

/** 注销轮询任务 */
export async function unregisterPolling(id: string): Promise<void> {
  try {
    await window.electronAPI.invoke('polling:unregister', { id })
  } catch { /* ignore */ }
}

/** 标记执行一次 */
export async function tickPolling(id: string): Promise<void> {
  try {
    await window.electronAPI.invoke('polling:tick', { id })
  } catch { /* ignore */ }
}

/** 更新轮询状态 */
export async function updatePolling(id: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await window.electronAPI.invoke('polling:update', { id, patch })
  } catch { /* ignore */ }
}
