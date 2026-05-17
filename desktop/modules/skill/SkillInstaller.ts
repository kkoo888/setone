/**
 * 技能安装服务
 * 支持市场搜索安装、URL 安装、自动更新三种方式
 */
import { mkdir, writeFile, readdir, stat, rm, readFile } from 'fs/promises'
import { join, basename } from 'path'
import { tmpdir } from 'os'
import type { Logger } from '../../src/main/types/logger'
import type { SkillScanner } from './SkillScanner'
import type { SkillDiscovery } from './SkillDiscovery'
import type {
  MarketSkill,
  InstallResult,
  UpdateInfo,
  InstallSource
} from './types'

/** 市场 API 基础地址 */
const MARKET_API_BASE = 'https://clawhub.com/api'

/** 临时目录前缀 */
const TEMP_PREFIX = 'setone-skill-'

/**
 * 技能安装器
 * 提供从市场/URL 安装技能及检查更新的能力
 */
export class SkillInstaller {
  private logger: Logger
  private scanner: SkillScanner
  private discovery: SkillDiscovery
  private skillsDir: string

  constructor(
    logger: Logger,
    scanner: SkillScanner,
    discovery: SkillDiscovery,
    skillsDir: string
  ) {
    this.logger = logger
    this.scanner = scanner
    this.discovery = discovery
    this.skillsDir = skillsDir
  }

  /**
   * 从市场搜索技能
   * @param query - 搜索关键词
   * @returns 匹配的市场技能列表
   */
  async searchMarket(query: string): Promise<MarketSkill[]> {
    try {
      const url = `${MARKET_API_BASE}/skills?q=${encodeURIComponent(query)}`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        this.logger.warn(`市场搜索请求失败: ${response.status}`)
        return []
      }

      const data = await response.json() as { skills?: MarketSkill[] }
      return data.skills ?? []
    } catch (err) {
      this.logger.warn('市场搜索失败，返回空结果', err as Error)
      return []
    }
  }

  /**
   * 从市场安装技能
   * @param skillId - 市场技能 ID
   * @returns 安装结果
   */
  async installFromMarket(skillId: string): Promise<InstallResult> {
    let tempDir: string | undefined

    try {
      // 1. 获取技能详情
      const detail = await this.fetchMarketDetail(skillId)
      if (!detail) {
        return { success: false, error: `无法获取技能 ${skillId} 的详情` }
      }

      // 2. 下载 zip 到临时目录
      tempDir = await this.createTempDir()
      const zipPath = join(tempDir, `${skillId}.zip`)
      const downloadUrl = `${MARKET_API_BASE}/skills/${skillId}/download`
      const downloaded = await this.downloadFile(downloadUrl, zipPath)

      if (!downloaded) {
        return { success: false, error: '下载技能包失败' }
      }

      // 3. 解压到临时目录
      const extractDir = join(tempDir, 'extracted')
      await this.extractZip(zipPath, extractDir)

      // 4. 扫描验证
      const scanResult = await this.scanner.scan(extractDir)

      // 5. 验证通过后移动到技能目录
      const destDir = join(this.skillsDir, skillId)
      await this.moveToSkills(extractDir, destDir)

      // 6. 写入安装来源标记
      await this.writeInstallMeta(destDir, 'market', detail.version)

      this.logger.info(`技能 ${skillId} 从市场安装成功`)

      return {
        success: true,
        skillId,
        scanResult
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`从市场安装技能失败: ${message}`, err as Error)
      return { success: false, error: message }
    } finally {
      if (tempDir) {
        await this.cleanupTemp(tempDir)
      }
    }
  }

  /**
   * 从 URL 安装技能
   * 支持 GitHub 仓库 URL 和直接 .zip 下载链接
   * @param url - 安装来源 URL
   * @returns 安装结果
   */
  async installFromUrl(url: string): Promise<InstallResult> {
    let tempDir: string | undefined

    try {
      // 1. 解析 URL，转换为可下载链接
      const downloadUrl = this.resolveDownloadUrl(url)
      const skillId = this.extractIdFromUrl(url)

      // 2. 下载到临时目录
      tempDir = await this.createTempDir()
      const zipPath = join(tempDir, `${skillId}.zip`)
      const downloaded = await this.downloadFile(downloadUrl, zipPath)

      if (!downloaded) {
        return { success: false, error: '下载失败，请检查 URL 是否正确' }
      }

      // 3. 解压
      const extractDir = join(tempDir, 'extracted')
      await this.extractZip(zipPath, extractDir)

      // 4. 定位技能根目录（可能在子目录中）
      const skillRoot = await this.findSkillRoot(extractDir)

      // 5. 扫描验证
      const scanResult = await this.scanner.scan(skillRoot)

      // 6. 移动到技能目录
      const destDir = join(this.skillsDir, skillId)
      await this.moveToSkills(skillRoot, destDir)

      // 7. 写入安装来源标记
      await this.writeInstallMeta(destDir, 'url', undefined)

      this.logger.info(`技能 ${skillId} 从 URL 安装成功`)

      return {
        success: true,
        skillId,
        scanResult
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`从 URL 安装技能失败: ${message}`, err as Error)
      return { success: false, error: message }
    } finally {
      if (tempDir) {
        await this.cleanupTemp(tempDir)
      }
    }
  }

  /**
   * 检查已安装技能的可用更新
   * @returns 有更新的技能列表
   */
  async checkUpdates(): Promise<UpdateInfo[]> {
    const updates: UpdateInfo[] = []

    try {
      // 扫描本地技能
      const skillDirs = [this.skillsDir]
      const localSkills = await this.discovery.discover(skillDirs)

      for (const skill of localSkills) {
        if (skill.installSource === 'local') continue

        const remoteVersion = await this.fetchRemoteVersion(skill.id, skill.installSource)
        if (!remoteVersion) continue

        if (this.compareVersions(remoteVersion, skill.version) > 0) {
          updates.push({
            skillId: skill.id,
            currentVersion: skill.version,
            latestVersion: remoteVersion
          })
        }
      }
    } catch (err) {
      this.logger.warn('检查更新失败', err as Error)
    }

    return updates
  }

  /**
   * 更新指定技能
   * @param skillId - 技能 ID
   * @returns 安装结果
   */
  async update(skillId: string): Promise<InstallResult> {
    let tempDir: string | undefined

    try {
      // 1. 读取本地技能元信息
      const skillPath = join(this.skillsDir, skillId)
      const meta = await this.readLocalMeta(skillPath)
      if (!meta) {
        return { success: false, error: `技能 ${skillId} 不存在或缺少元信息` }
      }

      // 2. 根据安装来源下载最新版本
      tempDir = await this.createTempDir()
      const zipPath = join(tempDir, `${skillId}.zip`)

      let downloadUrl: string
      if (meta.installSource === 'market') {
        downloadUrl = `${MARKET_API_BASE}/skills/${skillId}/download`
      } else if (meta.installSource === 'url' && meta.sourceUrl) {
        downloadUrl = this.resolveDownloadUrl(meta.sourceUrl)
      } else {
        return { success: false, error: '无法确定更新来源' }
      }

      const downloaded = await this.downloadFile(downloadUrl, zipPath)
      if (!downloaded) {
        return { success: false, error: '下载更新包失败' }
      }

      // 3. 解压到临时目录
      const extractDir = join(tempDir, 'extracted')
      await this.extractZip(zipPath, extractDir)

      // 4. 定位技能根目录
      const skillRoot = await this.findSkillRoot(extractDir)

      // 5. 扫描验证
      const scanResult = await this.scanner.scan(skillRoot)

      // 6. 替换旧版本
      await rm(skillPath, { recursive: true, force: true })
      await this.moveToSkills(skillRoot, skillPath)

      // 7. 更新安装来源标记
      await this.writeInstallMeta(skillPath, meta.installSource, meta.sourceUrl)

      this.logger.info(`技能 ${skillId} 更新成功`)

      return {
        success: true,
        skillId,
        scanResult
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`更新技能失败: ${message}`, err as Error)
      return { success: false, error: message }
    } finally {
      if (tempDir) {
        await this.cleanupTemp(tempDir)
      }
    }
  }

  /**
   * 获取市场技能详情
   * @param skillId - 技能 ID
   * @returns 技能详情或 null
   */
  private async fetchMarketDetail(skillId: string): Promise<MarketSkill | null> {
    try {
      const url = `${MARKET_API_BASE}/skills/${skillId}`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) return null
      return (await response.json()) as MarketSkill
    } catch {
      return null
    }
  }

  /**
   * 获取远程技能版本号
   * @param skillId - 技能 ID
   * @param source - 安装来源
   * @returns 版本号或 null
   */
  private async fetchRemoteVersion(
    skillId: string,
    source: InstallSource
  ): Promise<string | null> {
    try {
      if (source === 'market') {
        const detail = await this.fetchMarketDetail(skillId)
        return detail?.version ?? null
      }
      // URL 来源暂不支持自动检查版本（需要额外配置）
      return null
    } catch {
      return null
    }
  }

  /**
   * 将 GitHub URL 转换为 zip 下载链接
   * @param url - 原始 URL
   * @returns 可下载的 zip URL
   */
  private resolveDownloadUrl(url: string): string {
    // GitHub 仓库 URL → 下载 zip
    const githubMatch = url.match(
      /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/)?$/
    )
    if (githubMatch) {
      const [, owner, repo] = githubMatch
      return `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`
    }

    // GitHub 仓库 URL 带分支
    const githubBranchMatch = url.match(
      /github\.com\/([^/]+)\/([^/]+?)\/tree\/([^/]+)$/
    )
    if (githubBranchMatch) {
      const [, owner, repo, branch] = githubBranchMatch
      return `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`
    }

    // 已经是 zip 链接，直接返回
    if (url.endsWith('.zip')) {
      return url
    }

    // 其他 URL 尝试直接下载
    return url
  }

  /**
   * 从 URL 中提取技能 ID
   * @param url - 来源 URL
   * @returns 技能 ID
   */
  private extractIdFromUrl(url: string): string {
    // GitHub URL 提取仓库名
    const match = url.match(/github\.com\/[^/]+\/([^/.?#]+)/)
    if (match) return match[1]

    // 其他 URL 取最后一段路径
    try {
      const parsed = new URL(url)
      const segments = parsed.pathname.split('/').filter(Boolean)
      const last = segments[segments.length - 1] ?? 'skill'
      return last.replace(/\.zip$/, '')
    } catch {
      return `skill-${Date.now()}`
    }
  }

  /**
   * 创建临时目录
   * @returns 临时目录路径
   */
  private async createTempDir(): Promise<string> {
    const dir = join(tmpdir(), `${TEMP_PREFIX}${Date.now()}`)
    await mkdir(dir, { recursive: true })
    return dir
  }

  /**
   * 下载文件
   * @param url - 下载地址
   * @param destPath - 保存路径
   * @returns 是否成功
   */
  private async downloadFile(url: string, destPath: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60000)
      })

      if (!response.ok) {
        this.logger.warn(`下载失败: ${response.status} ${url}`)
        return false
      }

      const buffer = await response.arrayBuffer()
      await writeFile(destPath, Buffer.from(buffer))
      return true
    } catch (err) {
      this.logger.warn(`下载异常: ${url}`, err as Error)
      return false
    }
  }

  /**
   * 解压 zip 文件
   * 使用 Node.js 原生方式（AdmZip 或系统命令）
   * @param zipPath - zip 文件路径
   * @param destDir - 解压目标目录
   */
  private async extractZip(zipPath: string, destDir: string): Promise<void> {
    await mkdir(destDir, { recursive: true })

    // 使用系统 unzip 命令
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)

    try {
      await execFileAsync('unzip', ['-o', zipPath, '-d', destDir], {
        timeout: 30000
      })
    } catch {
      // 如果 unzip 不可用，尝试使用 busybox
      try {
        await execFileAsync('busybox', ['unzip', '-o', zipPath, '-d', destDir], {
          timeout: 30000
        })
      } catch (finalErr) {
        throw new Error(
          `解压失败: ${finalErr instanceof Error ? finalErr.message : String(finalErr)}`
        )
      }
    }
  }

  /**
   * 在解压目录中定位技能根目录
   * zip 解压后通常会有一层额外的目录（如 repo-main/）
   * @param dir - 解压目录
   * @returns 技能根目录路径
   */
  private async findSkillRoot(dir: string): Promise<string> {
    // 检查当前目录是否有 SKILL.md
    const hasSkillMd = await this.fileExists(join(dir, 'SKILL.md'))
    if (hasSkillMd) return dir

    // 检查子目录（通常 zip 解压后有一层）
    const entries = await readdir(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const s = await stat(fullPath).catch(() => null)
      if (!s?.isDirectory()) continue

      const hasChildSkillMd = await this.fileExists(join(fullPath, 'SKILL.md'))
      if (hasChildSkillMd) return fullPath
    }

    // 都没找到，返回第一个子目录或当前目录
    if (entries.length === 1) {
      const only = join(dir, entries[0])
      const s = await stat(only).catch(() => null)
      if (s?.isDirectory()) return only
    }

    return dir
  }

  /**
   * 移动文件到技能目录
   * @param src - 源目录
   * @param dest - 目标目录
   */
  private async moveToSkills(src: string, dest: string): Promise<void> {
    // 确保目标父目录存在
    await mkdir(this.skillsDir, { recursive: true })

    // 如果目标已存在，先删除
    await rm(dest, { recursive: true, force: true })

    // 使用 rename（同一文件系统内原子操作）或 copy + delete
    const { rename, cp } = await import('fs/promises')
    try {
      await rename(src, dest)
    } catch {
      // 跨文件系统时 rename 会失败，使用 cp
      await cp(src, dest, { recursive: true })
    }
  }

  /**
   * 写入安装来源标记
   * @param skillPath - 技能目录路径
   * @param source - 安装来源
   * @param sourceUrl - 来源 URL（可选）
   */
  private async writeInstallMeta(
    skillPath: string,
    source: InstallSource,
    sourceUrl?: string
  ): Promise<void> {
    const metaPath = join(skillPath, '.install-meta.json')
    const meta = {
      installSource: source,
      sourceUrl,
      installedAt: Date.now()
    }
    await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
  }

  /**
   * 读取本地技能安装元信息
   * @param skillPath - 技能目录路径
   * @returns 安装元信息或 null
   */
  private async readLocalMeta(
    skillPath: string
  ): Promise<{ installSource: InstallSource; sourceUrl?: string } | null> {
    try {
      const metaPath = join(skillPath, '.install-meta.json')
      const content = await readFile(metaPath, 'utf-8')
      return JSON.parse(content) as { installSource: InstallSource; sourceUrl?: string }
    } catch {
      return null
    }
  }

  /**
   * 检查文件是否存在
   * @param filePath - 文件路径
   * @returns 是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * 清理临时目录
   * @param dir - 临时目录路径
   */
  private async cleanupTemp(dir: string): Promise<void> {
    try {
      await rm(dir, { recursive: true, force: true })
    } catch {
      this.logger.warn(`清理临时目录失败: ${dir}`)
    }
  }

  /**
   * 比较版本号（semver）
   * @param a - 版本 A
   * @param b - 版本 B
   * @returns 正数表示 A > B，负数表示 A < B，0 表示相等
   */
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
