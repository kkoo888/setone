// 此文件在 utilityProcess 子进程中运行
// 注意：utilityProcess 中使用 process.parentPort（非 worker_threads.parentPort）

import { createHash, createHmac, randomBytes, randomUUID, randomInt, timingSafeEqual } from 'crypto'

const moduleId = process.env.MODULE_ID!
const modulePath = process.env.MODULE_PATH!

let moduleInstance: unknown = null

// ============================================================
// 沙箱逃逸防护：白名单模式 + API 拦截层
// ============================================================

/** 允许模块访问的安全 Node.js API 白名单 */
const ALLOWED_BUILTIN_MODULES = new Set([
  'events',
  'util',
  'url',
  'querystring',
  'path',
  'assert',
  'buffer',
  'crypto',
  'stream',
  'string_decoder',
  'timers',
  'perf_hooks',
])

/** 明确禁用的危险模块 */
const BLOCKED_MODULES = new Set([
  'fs',
  'fs/promises',
  'child_process',
  'net',
  'tls',
  'http',
  'https',
  'dgram',
  'dns',
  'cluster',
  'worker_threads',
  'vm',
  'v8',
  'module',
  'repl',
  'os',
  'process',
  'inspector',
  'trace_events',
])

/** 拦截操作日志 */
interface InterceptLog {
  timestamp: number
  moduleId: string
  action: string
  target: string
  blocked: boolean
  detail?: string
}

const interceptLogs: InterceptLog[] = []

/** 最大日志条数 */
const MAX_LOG_ENTRIES = 1000

/**
 * 记录拦截操作并发送审计日志到主进程
 * @param action - 操作类型
 * @param target - 操作目标
 * @param blocked - 是否被拦截
 * @param detail - 附加说明
 */
function logIntercept(
  action: string,
  target: string,
  blocked: boolean,
  detail?: string
): void {
  const entry: InterceptLog = {
    timestamp: Date.now(),
    moduleId,
    action,
    target,
    blocked,
    detail,
  }
  interceptLogs.push(entry)
  if (interceptLogs.length > MAX_LOG_ENTRIES) {
    interceptLogs.shift()
  }
  try {
    parentPort?.postMessage({
      channel: '__audit__',
      data: { type: 'sandbox_intercept', ...entry },
    })
  } catch {
    // 忽略发送失败
  }
}

/**
 * 限制环境变量传递：白名单模式，仅保留安全的基础运行时变量
 * ⚠️ 此白名单与 sandbox.ts 中 ALLOWED_ENV_KEYS 保持一致
 */
const ALLOWED_ENV_KEYS = [
  'MODULE_ID',
  'MODULE_PATH',
  'NODE_ENV',
  'APP_ROOT',
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'DISPLAY',
]

function sanitizeEnv(): void {
  const allowed = new Set(ALLOWED_ENV_KEYS)
  for (const key of Object.keys(process.env)) {
    if (!allowed.has(key)) {
      delete process.env[key]
    }
  }
}

sanitizeEnv()

/** 解析模块名（去掉 node: 前缀） */
function normalizeModuleName(specifier: string): string {
  if (specifier.startsWith('node:')) {
    return specifier.slice(5)
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return specifier
  }
  return specifier
}

/** 检查模块是否在白名单内 */
function isModuleAllowed(specifier: string): boolean {
  const name = normalizeModuleName(specifier)
  if (BLOCKED_MODULES.has(name)) {
    return false
  }
  if (name.startsWith('./') || name.startsWith('../')) {
    return true
  }
  return ALLOWED_BUILTIN_MODULES.has(name)
}

/**
 * 创建安全的 import 函数
 * @param originalImport - 原始 import 函数
 * @returns 包装后的安全 import 函数
 */
function createSafeImport(
  originalImport: (specifier: string) => Promise<unknown>
): (specifier: string) => Promise<unknown> {
  return async function safeImport(specifier: string): Promise<unknown> {
    if (!isModuleAllowed(specifier)) {
      logIntercept('import', specifier, true, '模块不在白名单中')
      throw new Error(
        `[Sandbox] 模块 "${specifier}" 在沙箱中被禁止导入。` +
          `允许的内置模块: ${[...ALLOWED_BUILTIN_MODULES].join(', ')}`
      )
    }
    logIntercept('import', specifier, false)
    return originalImport(specifier)
  }
}

/**
 * Crypto 安全子集：仅暴露哈希和随机数，禁止密钥操作
 * @returns 安全的 crypto 子集对象
 */
function createSafeCrypto(): Record<string, unknown> {
  return {
    createHash,
    createHmac,
    randomBytes,
    randomUUID,
    randomInt,
    timingSafeEqual,
  }
}

// 使用 process.parentPort（utilityProcess 专用 API）
const parentPort = process.parentPort

if (!parentPort) {
  console.error(
    'sandbox-worker: process.parentPort 不可用，当前进程可能不是 utilityProcess'
  )
  process.exit(1)
}

// 监听主进程消息
parentPort.on(
  'message',
  async (message: { channel: string; data?: unknown }) => {
    const { channel, data } = message

    switch (channel) {
      case '__init__': {
        try {
          const initData = data as { context?: Record<string, unknown> }

          // 1. 替换全局 import 为安全版本
          const originalImport = globalThis.import as (
            specifier: string
          ) => Promise<unknown>
          ;(globalThis as Record<string, unknown>).import =
            createSafeImport(originalImport)

          // 2. 禁用 eval / Function 构造器
          globalThis.eval = function sandboxEval(code: string) {
            logIntercept(
              'eval',
              'eval()',
              true,
              `尝试执行代码: ${String(code).slice(0, 100)}`
            )
            throw new Error('[Sandbox] eval() 在沙箱中被禁用')
          } as unknown as typeof globalThis.eval

          globalThis.Function = function sandboxFunction() {
            logIntercept('Function', 'Function()', true)
            throw new Error('[Sandbox] Function() 构造器在沙箱中被禁用')
          } as unknown as typeof globalThis.Function

          // 3. 拦截 require（兼容 CommonJS 模块加载）
          {
            const { createRequire } = await import('module')
            const originalRequire = createRequire(import.meta.url)
            const safeRequire = Object.assign(
              function safeReq(specifier: string): unknown {
                if (!isModuleAllowed(specifier)) {
                  logIntercept(
                    'require',
                    specifier,
                    true,
                    '模块不在白名单中'
                  )
                  throw new Error(
                    `[Sandbox] require("${specifier}") 在沙箱中被禁止`
                  )
                }
                if (specifier === 'crypto') {
                  return createSafeCrypto()
                }
                logIntercept('require', specifier, false)
                return originalRequire(specifier)
              },
              {
                resolve: () => {
                  throw new Error('[Sandbox] require.resolve 被禁用')
                },
                cache: {},
                main: undefined,
              }
            )
            ;(globalThis as Record<string, unknown>).require = safeRequire
          }

          // 4. 加载模块
          if (modulePath.endsWith('.ts') && !process.env.TS_NODE_DEV) {
            console.warn(
              `[sandbox-worker] 加载 .ts 文件: ${modulePath}，` +
                '生产环境建议使用编译后的 .js 文件'
            )
          }

          // Windows 绝对路径必须转为 file:// URL
          const { pathToFileURL } = await import('url')
          const { isAbsolute } = await import('path')
          const importTarget = isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath
          const mod = await import(importTarget)
          const ModuleClass = mod.default || mod
          moduleInstance = new ModuleClass(initData.context)
          await (
            moduleInstance as { activate(ctx: unknown): Promise<void> }
          ).activate(initData.context)
          parentPort.postMessage({ channel: '__ready__' })
        } catch (err) {
          parentPort.postMessage({
            channel: '__error__',
            data: { error: (err as Error).message },
          })
        }
        break
      }

      case '__shutdown__': {
        try {
          if (
            moduleInstance &&
            typeof (moduleInstance as Record<string, unknown>).deactivate ===
              'function'
          ) {
            await (
              moduleInstance as { deactivate: () => Promise<void> }
            ).deactivate()
          }
        } catch {
          // 忽略关闭错误
        }
        process.exit(0)
        break
      }

      default: {
        if (
          moduleInstance &&
          typeof (moduleInstance as Record<string, unknown>).handleMessage ===
            'function'
        ) {
          (
            moduleInstance as {
              handleMessage: (channel: string, data: unknown) => void
            }
          ).handleMessage(channel, data)
        }
        break
      }
    }
  }
)

// 通知主进程已启动
parentPort.postMessage({ channel: '__started__' })
