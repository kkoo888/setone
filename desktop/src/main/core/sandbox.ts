import { utilityProcess, UtilityProcess } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import type { ModuleMeta } from '../types/module'
import type { Logger } from '../types/logger'

/** 沙箱实例状态 */
export type SandboxStatus = 'starting' | 'running' | 'stopped' | 'error'

/** 资源使用量 */
export interface SandboxResourceUsage {
  memoryMB: number
  cpuPercent: number
}

/** 沙箱实例 */
export interface SandboxInstance {
  moduleId: string
  process: UtilityProcess
  status: SandboxStatus
  resourceUsage: SandboxResourceUsage
}

/** 环境变量白名单（与 sandbox-worker.ts 中 ALLOWED_ENV_KEYS 保持一致） */
const ALLOWED_ENV_KEYS = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'DISPLAY', 'APP_ROOT']

/** 子进程启动超时（毫秒） */
const START_TIMEOUT_MS = 10_000

/** 模块初始化超时（毫秒） */
const READY_TIMEOUT_MS = 15_000

/** 优雅关闭超时（毫秒） */
const SHUTDOWN_TIMEOUT_MS = 5_000

/**
 * 安全沙箱管理器
 *
 * 每个模块运行在独立的 utilityProcess 子进程中，
 * 通过白名单环境变量和 IPC 通道实现安全隔离。
 */
export class SandboxManager extends EventEmitter {
  private sandboxes = new Map<string, SandboxInstance>()
  private logger: Logger

  constructor(logger: Logger) {
    super()
    this.logger = logger
  }

  /**
   * 创建沙箱子进程
   * @param meta - 模块元数据
   * @param modulePath - 模块所在目录路径
   * @returns 创建的沙箱实例
   */
  async createSandbox(meta: ModuleMeta, modulePath: string): Promise<SandboxInstance> {
    const workerPath = join(__dirname, 'sandbox-worker.js')

    const entryJsPath = join(modulePath, 'index.js')
    const entryTsPath = join(modulePath, 'index.ts')
    const resolvedEntryPath = existsSync(entryJsPath) ? entryJsPath : entryTsPath

    const safeEnv: Record<string, string> = {
      NODE_ENV: process.env.NODE_ENV || 'production',
      MODULE_ID: meta.id,
      MODULE_PATH: resolvedEntryPath,
    }

    for (const key of ALLOWED_ENV_KEYS) {
      const value = process.env[key]
      if (value) {
        safeEnv[key] = value
      }
    }

    const childProcess = utilityProcess.fork(workerPath, [], {
      serviceName: `module-${meta.id}`,
      env: safeEnv,
    })

    const sandbox: SandboxInstance = {
      moduleId: meta.id,
      process: childProcess,
      status: 'starting',
      resourceUsage: { memoryMB: 0, cpuPercent: 0 },
    }

    this.sandboxes.set(meta.id, sandbox)

    childProcess.on('message', (message) => {
      this.handleMessage(meta.id, message as { channel: string; data?: unknown })
    })

    childProcess.on('exit', (code) => {
      sandbox.status = 'stopped'
      this.logger.warn(`沙箱进程退出: ${meta.id}`, { code })
      this.emit('sandbox:exit', { moduleId: meta.id, code })
    })

    childProcess.on('error', (err) => {
      sandbox.status = 'error'
      this.logger.error(`沙箱进程错误: ${meta.id}`, err)
      this.emit('sandbox:error', { moduleId: meta.id, error: err.message })
    })

    await this.waitForStarted(meta.id)

    const readyPromise = this.waitForReady(meta.id)

    childProcess.postMessage({
      channel: '__init__',
      data: { context: this.createSandboxContext(meta) },
    })

    await readyPromise

    sandbox.status = 'running'
    this.logger.info(`沙箱已创建: ${meta.id}`)

    return sandbox
  }

  /**
   * 向沙箱发送消息
   * @param moduleId - 模块 ID
   * @param channel - 消息通道
   * @param data - 消息数据
   * @returns 是否发送成功
   */
  send(moduleId: string, channel: string, data?: unknown): boolean {
    const sandbox = this.sandboxes.get(moduleId)
    if (!sandbox || sandbox.status !== 'running') {
      return false
    }

    sandbox.process.postMessage({ channel, data })
    return true
  }

  /**
   * 销毁沙箱
   * @param moduleId - 模块 ID
   */
  async destroySandbox(moduleId: string): Promise<void> {
    const sandbox = this.sandboxes.get(moduleId)
    if (!sandbox) {
      return
    }

    sandbox.process.postMessage({ channel: '__shutdown__' })

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        sandbox.process.kill()
        resolve()
      }, SHUTDOWN_TIMEOUT_MS)

      sandbox.process.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })

    this.sandboxes.delete(moduleId)
    this.logger.info(`沙箱已销毁: ${moduleId}`)
  }

  /**
   * 获取所有沙箱状态
   * @returns 沙箱状态列表
   */
  getStatuses(): Array<{
    moduleId: string
    status: SandboxStatus
    resourceUsage: SandboxResourceUsage
  }> {
    return Array.from(this.sandboxes.values()).map((s) => ({
      moduleId: s.moduleId,
      status: s.status,
      resourceUsage: s.resourceUsage,
    }))
  }

  /**
   * 等待子进程启动（收到 __started__）
   * @param moduleId - 模块 ID
   */
  private waitForStarted(moduleId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeListener(`message:${moduleId}`, handler)
        reject(new Error(`沙箱 "${moduleId}" 子进程启动超时`))
      }, START_TIMEOUT_MS)

      const handler = (message: { channel: string }) => {
        if (message.channel === '__started__') {
          clearTimeout(timeout)
          this.removeListener(`message:${moduleId}`, handler)
          resolve()
        }
      }

      this.on(`message:${moduleId}`, handler)
    })
  }

  /**
   * 等待模块初始化完成（收到 __ready__）
   * @param moduleId - 模块 ID
   */
  private waitForReady(moduleId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeListener(`message:${moduleId}`, handler)
        reject(new Error(`沙箱 "${moduleId}" 模块初始化超时`))
      }, READY_TIMEOUT_MS)

      const handler = (message: { channel: string }) => {
        if (message.channel === '__ready__') {
          clearTimeout(timeout)
          this.removeListener(`message:${moduleId}`, handler)
          resolve()
        }
        if (message.channel === '__error__') {
          clearTimeout(timeout)
          this.removeListener(`message:${moduleId}`, handler)
          reject(new Error(`沙箱 "${moduleId}" 模块初始化失败`))
        }
      }

      this.on(`message:${moduleId}`, handler)
    })
  }

  /**
   * 创建沙箱上下文（精简版 ModuleContext）
   * @param meta - 模块元数据
   */
  private createSandboxContext(meta: ModuleMeta): Record<string, unknown> {
    return {
      moduleId: meta.id,
    }
  }

  /**
   * 处理子进程消息
   * @param moduleId - 模块 ID
   * @param message - 子进程消息
   */
  private handleMessage(moduleId: string, message: { channel: string; data?: unknown }): void {
    if (
      message.channel === '__started__' ||
      message.channel === '__ready__' ||
      message.channel === '__error__'
    ) {
      this.emit(`message:${moduleId}`, message)
      return
    }

    if (message.channel === '__audit__') {
      const auditData = message.data as {
        type: string
        action: string
        target: string
        blocked: boolean
        detail?: string
      }
      if (auditData?.blocked) {
        this.logger.warn(`[安全审计] 沙箱 "${moduleId}" 拦截操作`, auditData)
      } else {
        this.logger.debug(`[安全审计] 沙箱 "${moduleId}" 允许操作`, auditData)
      }
      this.emit('sandbox:audit', { moduleId, ...auditData })
      return
    }

    this.emit('sandbox:message', {
      moduleId,
      channel: message.channel,
      data: message.data,
    })
  }
}
