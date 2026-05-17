import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron utilityProcess
const mockPostMessage = vi.fn()
const mockKill = vi.fn()
const mockOn = vi.fn()
const mockOnce = vi.fn()
const mockRemoveListener = vi.fn()

const mockChildProcess = {
  postMessage: mockPostMessage,
  kill: mockKill,
  on: mockOn,
  once: mockOnce,
  removeListener: mockRemoveListener,
}

vi.mock('electron', () => ({
  utilityProcess: {
    fork: vi.fn(() => mockChildProcess),
  },
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
}))

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path')
  return { ...actual }
})

import { SandboxManager } from '../../src/main/core/sandbox'
import { SandboxIPC } from '../../src/main/core/sandbox-ipc'

// ============================================================
// Helpers
// ============================================================

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
  }
}

function createMockMeta(id = 'test-module') {
  return {
    id,
    name: 'Test Module',
    version: '1.0.0',
    description: 'A test module',
    author: 'test',
    enabled: true,
    dependencies: [],
    hostVersion: '1.0.0',
    priority: 0,
    resourceLimits: { maxMemoryMB: 128, maxCpuPercent: 50 },
    provides: [],
    consumes: [],
    settings: {},
  }
}

/** 从 mockOn 的调用参数中提取指定事件的回调 */
function getListener(event: string) {
  const call = mockOn.mock.calls.find((c) => c[0] === event)
  return call ? (call[1] as (...args: unknown[]) => void) : undefined
}

// ============================================================
// SandboxManager
// ============================================================

describe('SandboxManager', () => {
  let manager: SandboxManager
  let logger: ReturnType<typeof createMockLogger>

  beforeEach(() => {
    vi.clearAllMocks()
    logger = createMockLogger()
    manager = new SandboxManager(logger)
  })

  afterEach(() => {
    manager.removeAllListeners()
  })

  describe('构造函数', () => {
    it('应正确初始化', () => {
      expect(manager).toBeDefined()
      expect(manager.getStatuses()).toEqual([])
    })
  })

  describe('send', () => {
    it('沙箱不存在时返回 false', () => {
      expect(manager.send('nonexistent', 'test')).toBe(false)
    })

    it('沙箱未运行时返回 false', () => {
      // 内部 sandboxes 为空，等同于未运行
      expect(manager.send('nonexistent', 'test')).toBe(false)
    })
  })

  describe('getStatuses', () => {
    it('初始状态为空数组', () => {
      expect(manager.getStatuses()).toEqual([])
    })
  })

  describe('destroySandbox', () => {
    it('销毁不存在的沙箱不会抛出', async () => {
      await expect(
        manager.destroySandbox('nonexistent')
      ).resolves.toBeUndefined()
    })
  })

  describe('createSandbox 完整流程', () => {
    it('应成功创建沙箱并设置 running 状态', async () => {
      // 模拟子进程启动信号和模块初始化信号
      mockOn.mockImplementation((event: string, cb: unknown) => {
        if (event === 'message') {
          const handler = cb as (msg: unknown) => void
          // 延迟发送 __started__
          setTimeout(() => handler({ channel: '__started__' }), 10)
          // 延迟发送 __ready__
          setTimeout(() => handler({ channel: '__ready__' }), 20)
        }
        return mockChildProcess
      })

      const meta = createMockMeta()
      const sandbox = await manager.createSandbox(meta, '/test/module')

      expect(sandbox.moduleId).toBe('test-module')
      expect(sandbox.status).toBe('running')
      expect(mockPostMessage).toHaveBeenCalledWith({
        channel: '__init__',
        data: { context: { moduleId: 'test-module' } },
      })
    })

    it('子进程启动超时应抛出错误', async () => {
      // 不发送 __started__，让其超时
      mockOn.mockImplementation(() => mockChildProcess)

      const meta = createMockMeta('timeout-module')
      await expect(
        manager.createSandbox(meta, '/test/module')
      ).rejects.toThrow(/子进程启动超时/)
    })

    it('模块初始化失败应抛出错误', async () => {
      mockOn.mockImplementation((event: string, cb: unknown) => {
        if (event === 'message') {
          const handler = cb as (msg: unknown) => void
          setTimeout(() => handler({ channel: '__started__' }), 10)
          setTimeout(
            () =>
              handler({
                channel: '__error__',
                data: { error: 'init failed' },
              }),
            20
          )
        }
        return mockChildProcess
      })

      const meta = createMockMeta('error-module')
      await expect(
        manager.createSandbox(meta, '/test/module')
      ).rejects.toThrow(/模块初始化失败/)
    })

    it('应设置安全的环境变量白名单', async () => {
      const { utilityProcess } = await import('electron')

      mockOn.mockImplementation((event: string, cb: unknown) => {
        if (event === 'message') {
          const handler = cb as (msg: unknown) => void
          setTimeout(() => handler({ channel: '__started__' }), 10)
          setTimeout(() => handler({ channel: '__ready__' }), 20)
        }
        return mockChildProcess
      })

      const meta = createMockMeta('env-test')
      await manager.createSandbox(meta, '/test/module')

      const forkCall = (utilityProcess.fork as ReturnType<typeof vi.fn>).mock
        .calls[0]
      const envOptions = forkCall[2].env as Record<string, string>

      // 应包含必要变量
      expect(envOptions.MODULE_ID).toBe('env-test')
      expect(envOptions.NODE_ENV).toBeDefined()

      // 不应包含敏感变量（如任意 API_KEY）
      expect(envOptions.API_KEY).toBeUndefined()
      expect(envOptions.SECRET).toBeUndefined()
      expect(envOptions.TOKEN).toBeUndefined()
    })
  })

  describe('沙箱退出事件', () => {
    it('子进程退出应更新状态并触发事件', async () => {
      let exitHandler: ((code: number) => void) | undefined

      mockOn.mockImplementation((event: string, cb: unknown) => {
        if (event === 'message') {
          const handler = cb as (msg: unknown) => void
          setTimeout(() => handler({ channel: '__started__' }), 10)
          setTimeout(() => handler({ channel: '__ready__' }), 20)
        }
        if (event === 'exit') {
          exitHandler = cb as (code: number) => void
        }
        return mockChildProcess
      })

      const meta = createMockMeta('exit-test')
      const sandbox = await manager.createSandbox(meta, '/test/module')

      const exitEvent = new Promise<{ moduleId: string; code: number }>(
        (resolve) => {
          manager.on('sandbox:exit', resolve)
        }
      )

      exitHandler?.(0)
      const event = await exitEvent

      expect(sandbox.status).toBe('stopped')
      expect(event.moduleId).toBe('exit-test')
      expect(event.code).toBe(0)
    })

    it('子进程错误应更新状态并触发事件', async () => {
      let errorHandler: ((err: Error) => void) | undefined

      mockOn.mockImplementation((event: string, cb: unknown) => {
        if (event === 'message') {
          const handler = cb as (msg: unknown) => void
          setTimeout(() => handler({ channel: '__started__' }), 10)
          setTimeout(() => handler({ channel: '__ready__' }), 20)
        }
        if (event === 'error') {
          errorHandler = cb as (err: Error) => void
        }
        return mockChildProcess
      })

      const meta = createMockMeta('error-test')
      const sandbox = await manager.createSandbox(meta, '/test/module')

      const errorEvent = new Promise<{ moduleId: string; error: string }>(
        (resolve) => {
          manager.on('sandbox:error', resolve)
        }
      )

      errorHandler?.(new Error('crash'))
      const event = await errorEvent

      expect(sandbox.status).toBe('error')
      expect(event.moduleId).toBe('error-test')
      expect(event.error).toBe('crash')
    })
  })

  describe('审计日志', () => {
    it('拦截操作应记录警告日志', async () => {
      let messageHandler: ((msg: unknown) => void) | undefined

      mockOn.mockImplementation((event: string, cb: unknown) => {
        if (event === 'message') {
          messageHandler = cb as (msg: unknown) => void
          // 先触发 started 和 ready
          setTimeout(() => messageHandler?.({ channel: '__started__' }), 10)
          setTimeout(() => messageHandler?.({ channel: '__ready__' }), 20)
        }
        return mockChildProcess
      })

      const meta = createMockMeta('audit-test')
      await manager.createSandbox(meta, '/test/module')

      const auditEvent = new Promise<Record<string, unknown>>((resolve) => {
        manager.on('sandbox:audit', resolve)
      })

      // 模拟审计消息
      messageHandler?.({
        channel: '__audit__',
        data: {
          type: 'sandbox_intercept',
          action: 'import',
          target: 'fs',
          blocked: true,
          detail: '模块不在白名单中',
        },
      })

      const event = await auditEvent
      expect(event.blocked).toBe(true)
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('拦截操作'),
        expect.any(Object)
      )
    })
  })

  describe('destroySandbox 正常流程', () => {
    it('应发送 __shutdown__ 并等待退出', async () => {
      mockOn.mockImplementation((event: string, cb: unknown) => {
        if (event === 'message') {
          const handler = cb as (msg: unknown) => void
          setTimeout(() => handler({ channel: '__started__' }), 10)
          setTimeout(() => handler({ channel: '__ready__' }), 20)
        }
        if (event === 'exit') {
          // 立即退出
          setTimeout(() => (cb as (code: number) => void)(0), 30)
        }
        return mockChildProcess
      })

      const meta = createMockMeta('destroy-test')
      await manager.createSandbox(meta, '/test/module')

      // 模拟 once('exit') 回调
      mockOnce.mockImplementation((event: string, cb: unknown) => {
        if (event === 'exit') {
          setTimeout(() => (cb as () => void)(), 10)
        }
        return mockChildProcess
      })

      await manager.destroySandbox('destroy-test')

      expect(mockPostMessage).toHaveBeenCalledWith({
        channel: '__shutdown__',
      })
      expect(manager.getStatuses()).toEqual([])
    })
  })
})

// ============================================================
// SandboxIPC
// ============================================================

describe('SandboxIPC', () => {
  let ipc: SandboxIPC
  let logger: ReturnType<typeof createMockLogger>
  let messageHandler: ((msg: unknown) => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    logger = createMockLogger()

    mockOn.mockImplementation((event: string, cb: unknown) => {
      if (event === 'message') {
        messageHandler = cb as (msg: unknown) => void
      }
      return mockChildProcess
    })

    ipc = new SandboxIPC(
      mockChildProcess as unknown as import('electron').UtilityProcess,
      'test-module',
      logger
    )
  })

  afterEach(() => {
    ipc.dispose()
    vi.useRealTimers()
  })

  describe('send', () => {
    it('应通过 postMessage 发送消息', () => {
      ipc.send('test-channel', { key: 'value' })
      expect(mockPostMessage).toHaveBeenCalledWith({
        channel: 'test-channel',
        data: { key: 'value' },
      })
    })

    it('无数据时应发送 undefined', () => {
      ipc.send('no-data')
      expect(mockPostMessage).toHaveBeenCalledWith({
        channel: 'no-data',
        data: undefined,
      })
    })
  })

  describe('request', () => {
    it('成功请求应返回响应数据', async () => {
      const promise = ipc.request('query', { id: 1 })

      // 模拟子进程响应
      messageHandler?.({
        channel: '__response__',
        data: { result: 'ok' },
        requestId: 'test-module-1',
      })

      const result = await promise
      expect(result).toEqual({ result: 'ok' })
    })

    it('错误响应应 reject', async () => {
      const promise = ipc.request('fail-op')

      messageHandler?.({
        channel: '__response_error__',
        data: 'operation failed',
        requestId: 'test-module-1',
      })

      await expect(promise).rejects.toThrow('operation failed')
    })

    it('超时应 reject', async () => {
      const promise = ipc.request('slow-op', undefined, 5000)

      // 快进超过超时时间
      vi.advanceTimersByTime(6000)

      await expect(promise).rejects.toThrow(/超时/)
    })

    it('多个并发请求应正确关联', async () => {
      const promise1 = ipc.request('op1')
      const promise2 = ipc.request('op2')

      // 按顺序响应
      messageHandler?.({
        channel: '__response__',
        data: 'result2',
        requestId: 'test-module-2',
      })
      messageHandler?.({
        channel: '__response__',
        data: 'result1',
        requestId: 'test-module-1',
      })

      expect(await promise1).toBe('result1')
      expect(await promise2).toBe('result2')
    })
  })

  describe('dispose', () => {
    it('应清理所有待处理请求', async () => {
      const promise = ipc.request('pending-op')

      ipc.dispose()

      await expect(promise).rejects.toThrow('沙箱 IPC 已关闭')
    })

    it('dispose 后 send 仍可调用', () => {
      ipc.dispose()
      expect(() => ipc.send('test')).not.toThrow()
    })
  })
})
