/**
 * 构建前清理脚本
 * 删除 dist 和 dist-packaged 目录（跨平台兼容）
 */
import { existsSync, rmSync } from 'fs'
const dirs = ['dist', 'modules-dist', 'dist-packaged']

for (const dir of dirs) {
  if (existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true })
      console.log('Cleaned:', dir)
    } catch (err) {
      // Windows 上目录可能被进程锁定，跳过即可
      console.warn(`Skipped (${err.code || 'unknown'}): ${dir}`)
    }
  }
}
