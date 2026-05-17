/**
 * E2E 测试辅助 — 应用生命周期管理
 * @description 启动/停止 Electron 应用、管理测试环境
 */
import { type Page, type ElectronApplication, _electron as electron } from '@playwright/test'
import { join } from 'path'
import { mkdirSync, rmSync, writeFileSync } from 'fs'

/** 测试应用配置 */
export interface TestAppConfig {
  /** 测试数据目录 */
  userDataDir?: string
  /** Mock Ollama 地址 */
  ollamaUrl?: string
  /** 初始配置 */
  initialConfig?: Record<string, unknown>
}

/**
 * 启动 Electron 测试应用
 */
export async function launchTestApp(config: TestAppConfig = {}): Promise<{
  app: ElectronApplication
  page: Page
  cleanup: () => Promise<void>
}> {
  const userDataDir = config.userDataDir ?? join('/tmp', `e2e-test-${Date.now()}`)
  mkdirSync(join(userDataDir, 'data'), { recursive: true })
  mkdirSync(join(userDataDir, 'config'), { recursive: true })

  // 写入测试配置
  const testConfig = {
    ollama: {
      baseUrl: config.ollamaUrl ?? 'http://127.0.0.1:11435',
      model: 'qwen2.5:7b',
      visionModel: 'llava:7b',
      timeout: 30000,
    },
    ui: { theme: 'dark', language: 'zh-CN' },
    modules: { enabled: [], disabled: [] },
    ...config.initialConfig,
  }
  writeFileSync(
    join(userDataDir, 'config', 'global.json'),
    JSON.stringify(testConfig, null, 2)
  )

  const app = await electron.launch({
    args: [join(__dirname, '../../dist/main/index.js')],
    env: {
      ...process.env,
      USER_DATA_DIR: userDataDir,
      ELECTRON_DISABLE_GPU: '1',
    },
  })

  const page = await app.firstWindow()

  // 等待页面加载完成
  await page.waitForLoadState('domcontentloaded')

  return {
    app,
    page,
    cleanup: async () => {
      await app.close()
      try {
        rmSync(userDataDir, { recursive: true, force: true })
      } catch {
        // 忽略清理错误
      }
    },
  }
}

/**
 * 等待指定毫秒
 */
export function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * 重试执行函数直到成功或超时
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { timeout?: number; interval?: number } = {}
): Promise<T> {
  const { timeout = 10000, interval = 500 } = options
  const start = Date.now()

  while (Date.now() - start < timeout) {
    try {
      return await fn()
    } catch {
      await wait(interval)
    }
  }
  throw new Error(`重试超时 (${timeout}ms)`)
}
