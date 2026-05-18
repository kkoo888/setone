/**
 * 渲染进程轮询辅助
 *
 * 提供两种注册方式：
 * 1. registerPolling()      — 核心轮询，不绑定模块（状态栏等）
 * 2. registerModulePolling() — 模块轮询，绑定模块 ID，模块关闭时自动清理
 *
 * 轮询列表变更由主进程推送（polling:updated），无需轮询拉取
 */

/** 注册核心轮询任务（不绑定模块） */
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

/**
 * 注册模块轮询任务（绑定 moduleId）
 * 模块 deactivate 时会自动清理，无需手动 unregister
 */
export async function registerModulePolling(task: {
  id: string
  module: string
  description: string
  intervalMs: number
  status?: 'running' | 'paused' | 'stopped'
}, moduleId: string): Promise<void> {
  try {
    await window.electronAPI.invoke('polling:registerModule', {
      task: { ...task, status: task.status ?? 'running' },
      moduleId,
    })
  } catch { /* ignore */ }
}

/** 注销轮询任务 */
export async function unregisterPolling(id: string): Promise<void> {
  try {
    await window.electronAPI.invoke('polling:unregister', { id })
  } catch { /* ignore */ }
}

/** 标记执行一次，可附带活动描述 */
export async function tickPolling(id: string, activity?: string): Promise<void> {
  try {
    await window.electronAPI.invoke('polling:tick', { id, activity })
  } catch { /* ignore */ }
}

/** 更新轮询状态 */
export async function updatePolling(id: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await window.electronAPI.invoke('polling:update', { id, patch })
  } catch { /* ignore */ }
}

/**
 * 监听轮询列表变更（主进程推送）
 * 返回取消监听的函数
 */
export function onPollingUpdate(callback: (tasks: unknown[]) => void): () => void {
  return window.electronAPI.on('polling:updated', callback)
}
