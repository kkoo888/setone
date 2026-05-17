import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron app
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-logs' }
}))

// Mock fs/promises to avoid real file I/O
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    appendFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockRejectedValue(new Error('ENOENT')),
    stat: vi.fn().mockResolvedValue({ size: 0 }),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined)
  }
})

import { AppLogger, createLogger } from '../../src/main/core/logger'

describe('AppLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('低于当前级别的日志不输出', async () => {
    const logger = new AppLogger('test', 'info')
    await logger['initialized']

    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    logger.debug('should not appear')
    // debug 低于 info，不应输出
    await vi.advanceTimersByTimeAsync(50)
    expect(consoleSpy).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('info 级别日志正常输出', async () => {
    const logger = new AppLogger('test', 'info')
    await logger['initialized']

    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    logger.info('hello', { key: 'value' })
    await vi.advanceTimersByTimeAsync(50)
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('error 包含错误堆栈', async () => {
    const logger = new AppLogger('test', 'debug')
    await logger['initialized']

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.error('failed', new Error('boom'))
    await vi.advanceTimersByTimeAsync(50)
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('setLevel 动态调整日志级别', async () => {
    const logger = new AppLogger('test', 'debug')
    await logger['initialized']

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    logger.info('before')
    await vi.advanceTimersByTimeAsync(50)
    expect(infoSpy).toHaveBeenCalledTimes(1)

    logger.setLevel('warn')

    logger.info('after')
    logger.debug('after debug')
    await vi.advanceTimersByTimeAsync(50)

    // setLevel('warn') 后 info 和 debug 都不应输出
    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(debugSpy).not.toHaveBeenCalled()

    infoSpy.mockRestore()
    debugSpy.mockRestore()
  })

  it('error 级别日志同时写入主日志和 error.log', async () => {
    const logger = new AppLogger('test-module', 'debug')
    await logger['initialized']

    const mainTransport = logger['transports'].find(
      (t: { constructor: { name: string }; filePath?: string }) =>
        t.constructor.name === 'FileTransport' && t.filePath?.includes('test-module.log')
    )
    const errorTransport = logger['errorTransport']

    const mainWriteSpy = vi.spyOn(mainTransport!, 'write')
    const errorWriteSpy = vi.spyOn(errorTransport!, 'write')

    logger.error('something broke', new Error('boom'))
    await vi.advanceTimersByTimeAsync(50)

    expect(mainWriteSpy).toHaveBeenCalled()
    expect(errorWriteSpy).toHaveBeenCalled()

    const writtenEntry = errorWriteSpy.mock.calls[0]?.[0] as { level: string; message: string }
    expect(writtenEntry.level).toBe('error')
    expect(writtenEntry.message).toBe('something broke')

    mainWriteSpy.mockRestore()
    errorWriteSpy.mockRestore()
  })

  it('info/warn 级别日志不写入 error.log', async () => {
    const logger = new AppLogger('test-module', 'debug')
    await logger['initialized']

    const errorTransport = logger['errorTransport']!
    const errorWriteSpy = vi.spyOn(errorTransport, 'write')

    logger.info('just info')
    logger.warn('just warn')
    await vi.advanceTimersByTimeAsync(50)

    expect(errorWriteSpy).not.toHaveBeenCalled()

    errorWriteSpy.mockRestore()
  })

  it('createLogger 工厂函数正常工作', async () => {
    const logger = createLogger('factory-test', 'debug')
    await (logger as AppLogger)['initialized']

    expect(logger).toBeInstanceOf(AppLogger)
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    logger.info('factory works')
    await vi.advanceTimersByTimeAsync(50)
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})
