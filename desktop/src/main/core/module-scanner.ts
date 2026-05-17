import { readdirSync, existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import type { ModuleMeta } from '../types/module'
import type { Logger } from '../types/logger'

export interface ScannedModule {
  meta: ModuleMeta
  path: string
  hash: string
}

export class ModuleScanner {
  constructor(
    private modulesDir: string,
    private logger: Logger
  ) {}

  async scan(): Promise<ScannedModule[]> {
    const results: ScannedModule[] = []

    if (!existsSync(this.modulesDir)) {
      this.logger.warn('模块目录不存在', { path: this.modulesDir })
      console.warn(`[ModuleScanner] \u26a0\ufe0f \u6a21\u5757\u76ee\u5f55\u4e0d\u5b58\u5728: ${this.modulesDir}`)
      return results
    }

    console.log(`[ModuleScanner] \u626b\u63cf\u76ee\u5f55: ${this.modulesDir}`)
    const entries = readdirSync(this.modulesDir, { withFileTypes: true })
    console.log(`[ModuleScanner] \u76ee\u5f55\u4e0b\u5171 ${entries.length} \u4e2a\u6761\u76ee`)

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const modulePath = join(this.modulesDir, entry.name)
      const metaPath = join(modulePath, 'module.json')

      if (!existsSync(metaPath)) {
        this.logger.debug(`跳过目录 "${entry.name}"：缺少 module.json`)
        continue
      }

      try {
        const metaRaw = await readFile(metaPath, 'utf-8')
        const meta = JSON.parse(metaRaw) as ModuleMeta
        const hash = await this.calculateHash(modulePath)

        results.push({ meta, path: modulePath, hash })
        this.logger.debug(`发现模块: ${meta.id} v${meta.version}`)
      } catch (err) {
        this.logger.warn(`模块 "${entry.name}" 的 module.json 解析失败`, { error: err })
      }
    }

    return results
  }

  private async calculateHash(modulePath: string): Promise<string> {
    const hash = createHash('md5')
    const metaPath = join(modulePath, 'module.json')
    const entryPath = existsSync(join(modulePath, 'index.js'))
      ? join(modulePath, 'index.js')
      : join(modulePath, 'index.ts')

    if (existsSync(metaPath)) hash.update(await readFile(metaPath))
    if (existsSync(entryPath)) hash.update(await readFile(entryPath))

    return hash.digest('hex')
  }
}
