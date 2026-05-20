/**
 * 性能监控与模型列表 IPC 处理器
 * performance:snapshot / ollama:listModels
 */
import { ipcMain } from 'electron'
import { registeredModuleIpc } from './module.handlers'
import type { HandlerDeps } from './types'

/** Ollama 模型信息 */
interface OllamaModel {
  readonly name: string
  readonly size: number
  readonly modified: string
}

/**
 * 注册性能监控相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerPerformanceHandlers(deps: HandlerDeps): void {
  const { config, logger } = deps

  registeredModuleIpc.add('ollama:listModels')
  registeredModuleIpc.add('performance:snapshot')

  /** 获取 Ollama 已安装的模型列表 */
  ipcMain.handle('ollama:listModels', async () => {
    const baseUrl = await config.get('ollama.baseUrl', 'http://localhost:11434')
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) {
        logger.warn(`Ollama 模型列表请求失败: ${response.status}`)
        return { success: false, models: [] as OllamaModel[] }
      }
      const data = await response.json() as { models?: OllamaModel[] }
      return { success: true, models: data.models ?? [] }
    } catch (err) {
      logger.warn('无法连接 Ollama 获取模型列表', err as Error)
      return { success: false, models: [] as OllamaModel[] }
    }
  })

  /** 获取系统资源快照（用于状态栏） */
  ipcMain.handle('performance:snapshot', async () => {
    try {
      const os = await import('os')
      const cpus = os.cpus()
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const usedMem = totalMem - freeMem

      // 计算 CPU 使用率
      const cpuUsage = cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
        const idle = cpu.times.idle
        return acc + ((total - idle) / total) * 100
      }, 0) / cpus.length

      return {
        cpu: Math.round(cpuUsage * 10) / 10,
        memory: Math.round((usedMem / totalMem) * 1000) / 10,
        memoryUsedMB: Math.round(usedMem / 1024 / 1024),
        memoryTotalMB: Math.round(totalMem / 1024 / 1024)
      }
    } catch {
      return { cpu: 0, memory: 0, memoryUsedMB: 0, memoryTotalMB: 0 }
    }
  })
}
