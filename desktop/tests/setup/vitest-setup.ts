/**
 * Vitest 全局测试设置文件
 * @description Mock Electron API、加载 @testing-library/jest-dom 扩展
 */
import { vi } from 'vitest'

// ── Electron Mock ────────────────────────────────────────────
// 模拟 Electron 主进程 API，避免测试依赖真实 Electron 运行时
vi.mock('electron', () => {
  const { createMockElectron } = require('../mocks/electron')
  return createMockElectron()
})

// ── @testing-library/jest-dom 扩展（渲染进程测试用） ──────────
// 在 jsdom 环境下提供 toBeInTheDocument、toHaveClass 等断言
try {
  await import('@testing-library/jest-dom/vitest')
} catch {
  // 未安装时跳过，主进程测试不需要
}

// ── 全局 Mock：console 输出抑制 ──────────────────────────────
// 测试中大量触发 warn/error，抑制噪音输出
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

// 仅在 CI 环境抑制，本地开发保留输出
if (process.env.CI) {
  console.error = vi.fn()
  console.warn = vi.fn()
}
