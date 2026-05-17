/**
 * Playwright E2E 测试配置
 * @description 端到端测试：使用 Electron 进行真实应用测试
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  fullyParallel: false, // Electron 测试需要串行
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'electron-main',
      testMatch: '**/*.spec.ts',
    },
  ],

  outputDir: 'test-results/e2e',
})
