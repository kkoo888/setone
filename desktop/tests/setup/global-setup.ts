/**
 * Vitest 全局设置 — 测试开始前执行
 * @description 创建临时目录、设置环境变量
 */
import { mkdirSync } from 'fs'
import { join } from 'path'

export async function setup(): Promise<void> {
  // 创建测试临时目录
  const tmpBase = join('/tmp', `vitest-${process.pid}`)
  mkdirSync(tmpBase, { recursive: true })
  process.env.TEST_TMP_DIR = tmpBase

  // 设置测试环境变量
  process.env.NODE_ENV = 'test'
  process.env.ELECTRON_DISABLE_GPU = '1'
}

export async function teardown(): Promise<void> {
  // 清理由 global-teardown 处理
}
