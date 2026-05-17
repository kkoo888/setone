/**
 * 技能导入/导出引擎
 * 支持将技能打包为可分享的归档文件，以及从归档文件导入技能
 *
 * 使用系统 tar 命令处理归档（gzip 压缩），无需额外依赖
 */
import { execFile } from 'node:child_process'
import { join, basename } from 'node:path'
import {
  readdir,
  stat,
  readFile,
  writeFile,
  mkdir,
  cp,
  rm,
  mkdtemp
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type { Logger } from '../../src/main/types/logger'
import type { SkillScanner } from './SkillScanner'
import type { ImportResult, ScanResult } from './types'

/** 导出元数据 */
interface ExportMeta {
  version: string
  exportedAt: string
  source: string
  skills: Array<{ id: string; name: string; version: string }>
}

/**
 * 技能导入/导出服务
 */
export class SkillTransfer {
  private logger: Logger
  private scanner: SkillScanner
  private skillsDir: string

  constructor(logger: Logger, scanner: SkillScanner, skillsDir: string) {
    this.logger = logger
    this.scanner = scanner
    this.skillsDir = skillsDir
  }

  /**
   * 导出单个技能为归档文件
   * @param skillId - 技能 ID
   * @param skillPath - 技能目录路径
   * @param outputPath - 输出文件路径（可选，默认为桌面）
   * @returns 导出文件的绝对路径
   */
  async exportSkill(
    skillId: string,
    skillPath: string,
    outputPath?: string
  ): Promise<string> {
    await this.validateSkillExists(skillPath)

    const output = outputPath ?? this.defaultOutputPath(skillId)
    const tmpDir = await this.createTempDir('skill-export-')
    const stagingDir = join(tmpDir, skillId)

    try {
      await cp(skillPath, stagingDir, { recursive: true })

      const meta = await this.buildExportMeta([{ id: skillId, path: skillPath }])
      await writeFile(join(tmpDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8')

      await this.createArchive(tmpDir, output)

      this.logger.info(`技能导出成功: ${skillId} → ${output}`)
      return output
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /**
   * 从归档文件导入技能
   * @param archivePath - 归档文件路径
   * @returns 导入结果
   */
  async importSkill(archivePath: string): Promise<ImportResult> {
    const tmpDir = await this.createTempDir('skill-import-')

    try {
      await this.extractArchive(archivePath, tmpDir)

      const meta = await this.readExportMeta(tmpDir)
      const skillDirs = await this.findSkillDirs(tmpDir)

      if (skillDirs.length === 0) {
        return { success: false, error: '归档中未找到有效的技能目录' }
      }

      const first = skillDirs[0]
      const scanResult = await this.scanner.scan(first.path)

      if (!scanResult.safe) {
        return {
          success: false,
          skillId: first.id,
          scanResult,
          error: '技能安全扫描未通过',
          warnings: scanResult.warnings
        }
      }

      const targetDir = join(this.skillsDir, first.id)
      await this.ensureDir(this.skillsDir)
      await cp(first.path, targetDir, { recursive: true })

      const skillMeta = meta?.skills.find((s) => s.id === first.id)
      this.logger.info(`技能导入成功: ${first.id}`)

      return {
        success: true,
        skillId: first.id,
        skillName: skillMeta?.name ?? first.id,
        scanResult,
        warnings: scanResult.warnings
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`技能导入失败: ${message}`)
      return { success: false, error: message }
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /**
   * 批量导出多个技能为单个归档
   * @param skillIds - 技能 ID 列表
   * @returns 导出文件路径
   */
  async exportMultiple(skillIds: string[]): Promise<string> {
    const tmpDir = await this.createTempDir('skill-batch-export-')
    const skills: Array<{ id: string; path: string; name: string; version: string }> = []

    try {
      for (const id of skillIds) {
        const skillPath = join(this.skillsDir, id)
        await this.validateSkillExists(skillPath)
        await cp(skillPath, join(tmpDir, id), { recursive: true })

        const content = await readFile(join(skillPath, 'SKILL.md'), 'utf-8').catch(() => '')
        const name = this.extractSkillName(content) ?? id
        const version = this.extractSkillVersion(content) ?? '1.0.0'
        skills.push({ id, path: skillPath, name, version })
      }

      const meta = await this.buildExportMeta(skills)
      await writeFile(join(tmpDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8')

      const output = this.defaultBatchOutputPath()
      await this.createArchive(tmpDir, output)

      this.logger.info(`批量导出成功: ${skillIds.length} 个技能 → ${output}`)
      return output
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /**
   * 从归档文件批量导入技能
   * @param archivePath - 归档文件路径
   * @returns 每个技能的导入结果
   */
  async importMultiple(archivePath: string): Promise<ImportResult[]> {
    const tmpDir = await this.createTempDir('skill-batch-import-')
    const results: ImportResult[] = []

    try {
      await this.extractArchive(archivePath, tmpDir)
      const meta = await this.readExportMeta(tmpDir)
      const skillDirs = await this.findSkillDirs(tmpDir)

      if (skillDirs.length === 0) {
        return [{ success: false, error: '归档中未找到有效的技能目录' }]
      }

      for (const { id, path: srcPath } of skillDirs) {
        try {
          const scanResult = await this.scanner.scan(srcPath)

          if (!scanResult.safe) {
            results.push({
              success: false,
              skillId: id,
              scanResult,
              error: '技能安全扫描未通过',
              warnings: scanResult.warnings
            })
            continue
          }

          const targetDir = join(this.skillsDir, id)
          await this.ensureDir(this.skillsDir)
          await cp(srcPath, targetDir, { recursive: true })

          const skillMeta = meta?.skills.find((s) => s.id === id)
          results.push({
            success: true,
            skillId: id,
            skillName: skillMeta?.name ?? id,
            scanResult,
            warnings: scanResult.warnings
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          results.push({ success: false, skillId: id, error: message })
        }
      }

      return results
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /** 验证技能目录存在 */
  private async validateSkillExists(skillPath: string): Promise<void> {
    const s = await stat(skillPath).catch(() => null)
    if (!s?.isDirectory()) {
      throw new Error(`技能目录不存在: ${skillPath}`)
    }
  }

  /** 生成默认导出路径 */
  private defaultOutputPath(skillId: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return join(tmpdir(), `skill-${skillId}-${timestamp}.tar.gz`)
  }

  /** 生成批量导出默认路径 */
  private defaultBatchOutputPath(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return join(tmpdir(), `skills-batch-${timestamp}.tar.gz`)
  }

  /** 创建临时目录 */
  private async createTempDir(prefix: string): Promise<string> {
    return mkdtemp(join(tmpdir(), prefix))
  }

  /** 确保目录存在 */
  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true })
  }

  /** 构建导出元数据 */
  private async buildExportMeta(
    skills: Array<{ id: string; path: string }>
  ): Promise<ExportMeta> {
    const skillEntries: ExportMeta['skills'] = []

    for (const skill of skills) {
      const content = await readFile(join(skill.path, 'SKILL.md'), 'utf-8').catch(() => '')
      skillEntries.push({
        id: skill.id,
        name: this.extractSkillName(content) ?? skill.id,
        version: this.extractSkillVersion(content) ?? '1.0.0'
      })
    }

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      source: 'smart-desktop-assistant',
      skills: skillEntries
    }
  }

  /** 从 SKILL.md 提取技能名称 */
  private extractSkillName(content: string): string | null {
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (fmMatch) {
      const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m)
      if (nameMatch) return nameMatch[1].trim()
    }
    const heading = content.match(/^#\s+(.+)$/m)
    return heading?.[1]?.trim() ?? null
  }

  /** 从 SKILL.md 提取版本号 */
  private extractSkillVersion(content: string): string | null {
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (fmMatch) {
      const versionMatch = fmMatch[1].match(/^version:\s*(.+)$/m)
      if (versionMatch) return versionMatch[1].trim()
    }
    return null
  }

  /**
   * 使用系统 tar 创建 gzip 归档
   */
  private createArchive(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(
        'tar',
        ['-czf', outputPath, '-C', sourceDir, '.'],
        { maxBuffer: 50 * 1024 * 1024 },
        (error, _stdout, stderr) => {
          if (error) {
            reject(new Error(`创建归档失败: ${stderr || error.message}`))
          } else {
            resolve()
          }
        }
      )
    })
  }

  /**
   * 使用系统 tar 解压归档
   */
  private extractArchive(archivePath: string, targetDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(
        'tar',
        ['-xzf', archivePath, '-C', targetDir],
        { maxBuffer: 50 * 1024 * 1024 },
        (error, _stdout, stderr) => {
          if (error) {
            reject(new Error(`解压归档失败: ${stderr || error.message}`))
          } else {
            resolve()
          }
        }
      )
    })
  }

  /** 读取归档中的 meta.json */
  private async readExportMeta(dir: string): Promise<ExportMeta | null> {
    try {
      const content = await readFile(join(dir, 'meta.json'), 'utf-8')
      return JSON.parse(content) as ExportMeta
    } catch {
      return null
    }
  }

  /**
   * 查找目录下的技能子目录（包含 SKILL.md 的目录）
   */
  private async findSkillDirs(
    baseDir: string
  ): Promise<Array<{ id: string; path: string }>> {
    const results: Array<{ id: string; path: string }> = []
    let entries: string[]

    try {
      entries = await readdir(baseDir)
    } catch {
      return results
    }

    for (const entry of entries) {
      if (entry === 'meta.json') continue
      const fullPath = join(baseDir, entry)
      const s = await stat(fullPath).catch(() => null)
      if (!s?.isDirectory()) continue

      const skillMd = join(fullPath, 'SKILL.md')
      const skillMdStat = await stat(skillMd).catch(() => null)
      if (skillMdStat?.isFile()) {
        results.push({ id: entry, path: fullPath })
      }
    }

    return results
  }
}
