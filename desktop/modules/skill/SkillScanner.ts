import { readFile, stat, readdir } from 'fs/promises'
import { join, extname } from 'path'
import type { Logger } from '../../src/main/types/logger'
import type { SkillDiscovery } from './SkillDiscovery'
import type {
  ScanResult,
  Permission,
  PermissionCheck,
  DependencyCheck,
  CompatibilityCheck
} from './types'

/** 高风险权限组合 */
const HIGH_RISK_COMBOS: Permission[][] = [
  ['exec', 'network'],
  ['file.write', 'exec'],
  ['screen', 'network']
]

/** 权限风险等级映射 */
const PERMISSION_RISK: Record<Permission, 'low' | 'medium' | 'high'> = {
  'file.read': 'low',
  'file.write': 'medium',
  'network': 'medium',
  'exec': 'high',
  'screen': 'high',
  'clipboard': 'low',
  'notification': 'low'
}

/** 权限说明 */
const PERMISSION_NOTES: Record<Permission, string> = {
  'file.read': '读取本地文件',
  'file.write': '写入/修改本地文件',
  'network': '发起网络请求',
  'exec': '执行系统命令',
  'screen': '截屏或录屏',
  'clipboard': '访问剪贴板',
  'notification': '发送系统通知'
}

/**
 * 安装前扫描引擎
 * 检查技能的安全性、依赖、兼容性和权限声明
 */
export class SkillScanner {
  private logger: Logger
  private discovery: SkillDiscovery
  private appVersion: string

  constructor(logger: Logger, discovery: SkillDiscovery, appVersion = '1.0.0') {
    this.logger = logger
    this.discovery = discovery
    this.appVersion = appVersion
  }

  /**
   * 执行完整的安装前扫描
   * @param skillPath - 技能目录路径
   * @returns 扫描结果
   */
  async scan(skillPath: string): Promise<ScanResult> {
    const warnings: string[] = []

    // 1. 检查目录是否存在
    const dirStat = await stat(skillPath).catch(() => null)
    if (!dirStat?.isDirectory()) {
      return {
        safe: false,
        permissions: [],
        dependencies: [],
        compatibility: { compatible: false, reason: '技能目录不存在' },
        warnings: ['路径不是有效的目录']
      }
    }

    // 2. 解析 SKILL.md 获取声明的权限
    const skillMdPath = join(skillPath, 'SKILL.md')
    const content = await readFile(skillMdPath, 'utf-8').catch(() => '')
    if (!content) {
      warnings.push('未找到 SKILL.md 文件')
    }

    const meta = await this.discovery.parseSkillMd(skillMdPath, skillPath)
    const declaredPermissions = meta?.permissions ?? []

    // 3. 扫描代码检测实际使用的权限
    const codeFiles = await this.collectCodeFiles(skillPath)
    const allCodeContent = await this.readCodeFiles(codeFiles)
    const detectedPermissions = this.discovery.detectPermissions(allCodeContent)

    // 4. 权限对比分析
    const permissionChecks = this.analyzePermissions(declaredPermissions, detectedPermissions)

    // 5. 依赖检查
    const dependencyChecks = await this.checkDependencies(skillPath)

    // 6. 兼容性检查
    const compatibility = this.checkCompatibility(content)

    // 7. 生成警告
    const undeclared = permissionChecks.filter((p) => p.detected && !p.declared)
    if (undeclared.length > 0) {
      warnings.push(`检测到未声明的权限: ${undeclared.map((u) => u.permission).join(', ')}`)
    }

    const highRisk = permissionChecks.filter((p) => p.risk === 'high' && p.detected)
    if (highRisk.length > 0) {
      warnings.push(`包含高风险权限: ${highRisk.map((h) => h.permission).join(', ')}`)
    }

    // 检查高风险权限组合
    for (const combo of HIGH_RISK_COMBOS) {
      const hasAll = combo.every((p) => detectedPermissions.includes(p))
      if (hasAll) {
        warnings.push(`检测到高风险权限组合: ${combo.join(' + ')}`)
      }
    }

    // 检查不满足的依赖
    const unsatisfiedDeps = dependencyChecks.filter((d) => !d.satisfied)
    if (unsatisfiedDeps.length > 0) {
      warnings.push(`有 ${unsatisfiedDeps.length} 个依赖未满足`)
    }

    const safe = warnings.length === 0 && compatibility.compatible

    this.logger.info(`技能扫描完成: ${skillPath}, 安全=${safe}, 警告=${warnings.length}`)

    return {
      safe,
      permissions: permissionChecks,
      dependencies: dependencyChecks,
      compatibility,
      warnings
    }
  }

  /** 收集目录下的代码文件 */
  private async collectCodeFiles(dir: string, maxDepth = 3): Promise<string[]> {
    const codeExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
    const files: string[] = []

    const walk = async (currentDir: string, depth: number) => {
      if (depth > maxDepth) return
      let entries: string[]
      try {
        entries = await readdir(currentDir)
      } catch {
        return
      }

      for (const entry of entries) {
        if (entry === 'node_modules' || entry === '.git') continue
        const fullPath = join(currentDir, entry)
        const s = await stat(fullPath).catch(() => null)
        if (!s) continue

        if (s.isDirectory()) {
          await walk(fullPath, depth + 1)
        } else if (codeExts.has(extname(entry))) {
          files.push(fullPath)
        }
      }
    }

    await walk(dir, 0)
    return files
  }

  /** 读取所有代码文件内容并拼接 */
  private async readCodeFiles(files: string[]): Promise<string> {
    const parts: string[] = []
    for (const file of files) {
      const content = await readFile(file, 'utf-8').catch(() => '')
      if (content) parts.push(content)
    }
    return parts.join('\n')
  }

  /** 分析权限声明与实际使用的一致性 */
  private analyzePermissions(
    declared: Permission[],
    detected: Permission[]
  ): PermissionCheck[] {
    const allPermissions: Permission[] = [
      'file.read', 'file.write', 'network', 'exec',
      'screen', 'clipboard', 'notification'
    ]

    return allPermissions.map((perm) => ({
      permission: perm,
      declared: declared.includes(perm),
      detected: detected.includes(perm),
      risk: PERMISSION_RISK[perm],
      note: PERMISSION_NOTES[perm]
    }))
  }

  /** 检查依赖是否满足 */
  private async checkDependencies(skillPath: string): Promise<DependencyCheck[]> {
    const checks: DependencyCheck[] = []

    // 读取 package.json
    const pkgPath = join(skillPath, 'package.json')
    const pkgContent = await readFile(pkgPath, 'utf-8').catch(() => '')
    if (!pkgContent) return checks

    try {
      const pkg = JSON.parse(pkgContent) as {
        dependencies?: Record<string, string>
        peerDependencies?: Record<string, string>
      }

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.peerDependencies
      }

      for (const [name, version] of Object.entries(allDeps ?? {})) {
        const installed = await this.findInstalledVersion(skillPath, name)
        checks.push({
          name,
          required: version,
          satisfied: installed !== undefined,
          installed,
          hint: installed === undefined ? `请安装 ${name}@${version}` : undefined
        })
      }
    } catch {
      // package.json 解析失败，跳过依赖检查
    }

    return checks
  }

  /** 查找已安装的依赖版本 */
  private async findInstalledVersion(basePath: string, depName: string): Promise<string | undefined> {
    const pkgPath = join(basePath, 'node_modules', depName, 'package.json')
    const content = await readFile(pkgPath, 'utf-8').catch(() => '')
    if (!content) return undefined

    try {
      const pkg = JSON.parse(content) as { version?: string }
      return pkg.version
    } catch {
      return undefined
    }
  }

  /** 检查兼容性 */
  private checkCompatibility(content: string): CompatibilityCheck {
    // 检查是否有最低版本要求
    const minVersionMatch = content.match(/minVersion:\s*["']?(\d+\.\d+\.\d+)["']?/)
    if (minVersionMatch) {
      const minVersion = minVersionMatch[1]
      const compatible = this.compareVersions(this.appVersion, minVersion) >= 0
      return {
        compatible,
        minVersion,
        currentVersion: this.appVersion,
        reason: compatible ? undefined : `需要 v${minVersion} 或更高版本`
      }
    }

    return { compatible: true, currentVersion: this.appVersion }
  }

  /** 比较版本号（semver） */
  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  }
}
