/**
 * Vitest 渲染进程测试配置（jsdom 环境）
 * @description 用于 src/renderer/** 的组件测试、Hook 测试
 */
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // 渲染进程使用 jsdom 模拟浏览器环境
    environment: 'jsdom',

    globals: true,
    setupFiles: ['./tests/setup/vitest-setup.ts'],

    include: [
      'tests/unit/renderer/**/*.test.{ts,tsx}',
      'tests/integration/renderer/**/*.test.{ts,tsx}',
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/renderer/**'],
      exclude: [
        'src/renderer/src/types/**',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },

    testTimeout: 15000,
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
})
