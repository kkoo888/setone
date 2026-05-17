/**
 * Vitest 主配置 — 主进程测试（Node 环境）
 * @description 用于 src/main/** 和 src/preload/** 的单元测试、集成测试
 */
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    // 主进程测试使用 Node 环境
    environment: 'node',

    // 全局测试设置
    globals: true,
    setupFiles: ['./tests/setup/vitest-setup.ts'],
    globalSetup: ['./tests/setup/global-setup.ts'],

    // 测试文件匹配规则
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/contract/**/*.contract.ts',
    ],

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/main/**', 'src/preload/**'],
      exclude: [
        'src/main/index.ts',
        'src/main/types/**',
        '**/*.d.ts',
      ],
      // 覆盖率阈值：80%
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },

    // 测试超时
    testTimeout: 15000,
    hookTimeout: 10000,

    // 并发控制
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },

  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@modules': resolve(__dirname, 'modules'),
    },
  },
})
