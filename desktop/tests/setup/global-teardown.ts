/**
 * Vitest 全局清理 — 测试结束后执行
 * @description 清理临时目录、重置环境变量
 */
import { rmSync } from 'fs'

export async function teardown(): Promise<void> {
  // 清理测试临时目录
  const tmpBase = process.env.TEST_TMP_DIR
  if (tmpBase) {
    try {
      rmSync(tmpBase, { recursive: true, force: true })
    } catch {
      // 忽略清理错误
    }
  }

  // 重置环境变量
  delete process.env.TEST_TMP_DIR
}
