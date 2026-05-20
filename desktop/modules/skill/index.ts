import { join } from 'path'
import { readFile } from 'fs/promises'
import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { SkillDiscovery } from './SkillDiscovery'
import { SkillScanner } from './SkillScanner'
import { SkillCreator } from './SkillCreator'
import { SkillStateRepository } from './repositories/skill-state-repository'
import { SkillStatsRepository } from './repositories/skill-stats-repository'
import { SkillPersistService } from './services/skill-persist-service'
import { SkillTransfer } from './SkillTransfer'
import { SkillInstaller } from './SkillInstaller'
import { SkillRefiner } from './services/SkillRefiner'
import { SkillChain } from './services/SkillChain'
import { SkillStats } from './services/SkillStats'
import type {
  SkillMeta,
  SkillDefinition,
  CreateSkillParams,
  ImportResult,
  MarketSkill,
  InstallResult,
  UpdateInfo
} from './types'

/**
 * 技能模块
 * 提供技能的发现、创建、扫描、激活/停用、统计等完整生命周期管理
 */
export default class SkillModule implements Module {
  id = 'skill'
  meta!: import('../../src/main/types/module').ModuleMeta

  private discovery!: SkillDiscovery
  private scanner!: SkillScanner
  private creator!: SkillCreator
  private service!: SkillPersistService
  private transfer!: SkillTransfer
  private installer!: SkillInstaller
  private refiner!: SkillRefiner
  private skills = new Map<string, SkillDefinition>()
  private context!: ModuleContext

  async activate(context: ModuleContext): Promise<void> {
    this.context = context

    // 初始化 Repository + Service 分层
    const stateFilePath = join(context.config.dataDir, 'skill-state.json')
    const stateRepo = new SkillStateRepository(context.logger, stateFilePath)
    const statsRepo = new SkillStatsRepository(context.db, context.logger)
    this.service = new SkillPersistService(stateRepo, statsRepo, context.logger)
    await this.service.init()

    // 从持久化恢复激活状态
    const savedStates = this.service.getAllSkillStates()

    // 初始化发现引擎（传入已保存的激活状态）
    const activeStates = new Map<string, boolean>()
    for (const [id, entry] of Object.entries(savedStates)) {
      activeStates.set(id, entry.active)
    }
    this.discovery = new SkillDiscovery(context.logger, activeStates)

    // 初始化扫描引擎
    this.scanner = new SkillScanner(context.logger, this.discovery)

    // 初始化创建引擎（使用 skillSearchPaths 或默认路径）
    const skillSearchPaths = context.config.skillSearchPaths ?? []
    const skillsDir = skillSearchPaths[0] ?? join(process.cwd(), 'skills')
    this.creator = new SkillCreator(context.logger, context.ai, skillsDir)

    // 初始化导入/导出引擎
    this.transfer = new SkillTransfer(context.logger, this.scanner, skillsDir)

    // 初始化安装引擎
    this.installer = new SkillInstaller(context.logger, this.scanner, this.discovery, skillsDir)

    // 初始化炼化引擎
    this.refiner = new SkillRefiner(context.logger, context.ai)

    // 扫描并加载技能
    const skillDirs = skillSearchPaths.length > 0 ? skillSearchPaths : [join(process.cwd(), 'skills')]
    const metas = await this.discovery.discover(skillDirs)
    for (const meta of metas) {
      // 合并持久化状态
      const saved = savedStates[meta.id]
      if (saved) {
        meta.active = saved.active
        meta.config = saved.config
        meta.installedAt = saved.installedAt
        meta.lastUsedAt = saved.lastUsedAt
        meta.useCount = saved.useCount
      }
      this.skills.set(meta.id, { meta })
    }

    context.logger.info(`技能模块已激活，加载 ${metas.length} 个技能`)
  }

  async deactivate(): Promise<void> {
    await this.service.flush()
    this.context.logger.info('技能模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      // --- 列出所有技能 ---
      {
        type: 'tool',
        name: 'skill_list',
        description: '列出所有技能',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async () => {
            return Array.from(this.skills.values()).map((s) => ({
              id: s.meta.id,
              name: s.meta.name,
              description: s.meta.description,
              version: s.meta.version,
              author: s.meta.author,
              icon: s.meta.icon,
              tags: s.meta.tags,
              permissions: s.meta.permissions,
              level: s.meta.level,
              active: s.meta.active,
              installSource: s.meta.installSource,
              installedAt: s.meta.installedAt,
              lastUsedAt: s.meta.lastUsedAt,
              useCount: s.meta.useCount,
              avgDuration: s.meta.avgDuration,
              path: s.meta.path
            }))
          }
        }
      },

      // --- 重新扫描技能目录 ---
      {
        type: 'tool',
        name: 'skill_discover',
        description: '重新扫描技能目录',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { dirs } = p as { dirs: string[] }
            const metas = await this.discovery.discover(dirs)
            for (const meta of metas) {
              const saved = this.service.getSkillState(meta.id)
              if (saved) {
                meta.active = saved.active
                meta.config = saved.config
                meta.installedAt = saved.installedAt
                meta.lastUsedAt = saved.lastUsedAt
                meta.useCount = saved.useCount
              }
              this.skills.set(meta.id, { meta })
            }
            return { discovered: metas.length }
          }
        }
      },

      // --- 激活/停用技能 ---
      {
        type: 'tool',
        name: 'skill_toggle',
        description: '激活或停用技能',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id, active } = p as { id: string; active: boolean }
            const skill = this.skills.get(id)
            if (!skill) {
              return { success: false, error: `技能 ${id} 不存在` }
            }
            skill.meta.active = active
            this.service.setActive(id, active)
            this.context.eventBus.emit('skill:toggled', { id, active })
            return { success: true, id, active }
          }
        }
      },

      // --- 创建新技能 ---
      {
        type: 'tool',
        name: 'skill_create',
        description: 'AI 辅助创建新技能',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const params = p as unknown as CreateSkillParams
            const meta = await this.creator.create(params)
            this.skills.set(meta.id, { meta })
            this.service.setActive(meta.id, true)
            return { success: true, data: meta }
          }
        }
      },

      // --- 炼化优化 ---
      {
        type: 'tool',
        name: 'skill_refine',
        description: '对已有技能进行 AI 分析和优化',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id, instruction } = p as { id: string; instruction: string }
            const skill = this.skills.get(id)
            if (!skill) {
              return { success: false, error: `技能 ${id} 不存在` }
            }

            const result = await this.refiner.refine(
              id,
              skill.meta.path,
              skill.meta,
              instruction
            )

            // 更新版本号
            const parts = skill.meta.version.split('.')
            const patch = parseInt(parts[2] ?? '0', 10) + 1
            skill.meta.version = `${parts[0]}.${parts[1]}.${patch}`

            return { success: true, data: { version: skill.meta.version, ...result } }
          }
        }
      },

      // --- 炼化分析 ---
      {
        type: 'tool',
        name: 'skill_refine_analyze',
        description: 'AI 分析技能质量并给出优化建议',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id } = p as { id: string }
            const skill = this.skills.get(id)
            if (!skill) {
              return { success: false, error: `技能 ${id} 不存在` }
            }

            const result = await this.refiner.analyze(id, skill.meta.path, skill.meta)
            return { success: true, data: result }
          }
        }
      },

      // --- 删除技能 ---
      {
        type: 'tool',
        name: 'skill_delete',
        description: '删除技能（移到回收站）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id } = p as { id: string }
            const skill = this.skills.get(id)
            if (!skill) {
              return { success: false, error: `技能 ${id} 不存在` }
            }
            await this.service.moveToTrash(id, skill.meta.path)
            this.skills.delete(id)
            return { success: true }
          }
        }
      },

      // --- 安装前扫描 ---
      {
        type: 'tool',
        name: 'skill_scan',
        description: '安装前自动扫描（安全 + 依赖 + 兼容 + 权限）',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { path } = p as { path: string }
            const result = await this.scanner.scan(path)
            return { success: true, data: result }
          }
        }
      },

      // --- 使用统计 ---
      {
        type: 'tool',
        name: 'skill_stats',
        description: '获取技能使用统计',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id } = p as { id?: string }
            const stats = await this.service.getStats(id)
            return { success: true, data: stats }
          }
        }
      },

      // --- 获取/更新配置 ---
      {
        type: 'tool',
        name: 'skill_config',
        description: '获取或更新技能参数配置',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id, config } = p as { id: string; config?: Record<string, unknown> }
            const skill = this.skills.get(id)
            if (!skill) {
              return { success: false, error: `技能 ${id} 不存在` }
            }
            if (config !== undefined) {
              skill.meta.config = config
              this.service.setConfig(id, config)
              return { success: true, data: config }
            }
            return { success: true, data: skill.meta.config ?? {} }
          }
        }
      },

      // --- 回收站：列表 ---
      {
        type: 'tool',
        name: 'skill_trash_list',
        description: '获取回收站列表',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async () => {
            return { success: true, data: this.service.getTrash() }
          }
        }
      },

      // --- 回收站：恢复 ---
      {
        type: 'tool',
        name: 'skill_trash_restore',
        description: '从回收站恢复技能',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id } = p as { id: string }
            const path = await this.service.restoreFromTrash(id)
            if (!path) {
              return { success: false, error: `技能 ${id} 不在回收站中` }
            }
            // 重新发现该技能目录下的技能
            const metas = await this.discovery.discover([path])
            for (const meta of metas) {
              if (meta.id === id) {
                const saved = this.service.getSkillState(id)
                if (saved) {
                  meta.active = saved.active
                  meta.config = saved.config
                }
                this.skills.set(id, { meta })
              }
            }
            return { success: true }
          }
        }
      },

      // --- 回收站：清空 ---
      {
        type: 'tool',
        name: 'skill_trash_empty',
        description: '清空回收站',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async () => {
            const count = this.service.emptyTrash()
            return { success: true, count }
          }
        }
      },

      // --- 回收站：永久删除 ---
      {
        type: 'tool',
        name: 'skill_trash_delete',
        description: '永久删除回收站中的技能',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id } = p as { id: string }
            const ok = this.service.permanentDelete(id)
            if (!ok) {
              return { success: false, error: `技能 ${id} 不在回收站中` }
            }
            return { success: true }
          }
        }
      },

      // --- 记录使用（内部调用） ---
      {
        type: 'tool',
        name: 'skill_record_usage',
        description: '记录技能使用（内部）',
        priority: 1,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id, durationMs, success, error } = p as {
              id: string; durationMs: number; success: boolean; error?: string
            }
            await this.service.recordUsage(id, durationMs, success, error)
            const skill = this.skills.get(id)
            if (skill) {
              skill.meta.lastUsedAt = Date.now()
              skill.meta.useCount += 1
            }
            return { success: true }
          }
        }
      },

      // --- 导出技能 ---
      {
        type: 'tool',
        name: 'skill_export',
        description: '导出技能为可分享的归档文件',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { id, outputPath } = p as { id: string; outputPath?: string }
            const skill = this.skills.get(id)
            if (!skill) {
              return { success: false, error: `技能 ${id} 不存在` }
            }
            try {
              const filePath = await this.transfer.exportSkill(id, skill.meta.path, outputPath)
              return { success: true, data: { filePath } }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 导入技能 ---
      {
        type: 'tool',
        name: 'skill_import',
        description: '从归档文件导入技能',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { archivePath } = p as { archivePath: string }
            const result = await this.transfer.importSkill(archivePath)
            if (result.success && result.skillId) {
              // 重新发现以加载新技能
              const skillDirs = (this.context.config.skillSearchPaths ?? [])
              if (skillDirs.length > 0) {
                await this.discovery.discover(skillDirs)
              }
            }
            return { success: result.success, data: result }
          }
        }
      },

      // --- 批量导出 ---
      {
        type: 'tool',
        name: 'skill_export_batch',
        description: '批量导出多个技能为单个归档',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { ids } = p as { ids: string[] }
            try {
              const filePath = await this.transfer.exportMultiple(ids)
              return { success: true, data: { filePath } }
            } catch (err) {
              return { success: false, error: (err as Error).message }
            }
          }
        }
      },

      // --- 批量导入 ---
      {
        type: 'tool',
        name: 'skill_import_batch',
        description: '从归档文件批量导入技能',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { archivePath } = p as { archivePath: string }
            const results = await this.transfer.importMultiple(archivePath)
            return { success: true, data: results }
          }
        }
      },

      // --- 市场搜索 ---
      {
        type: 'tool',
        name: 'skill_market_search',
        description: '搜索技能市场',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { query } = p as { query: string }
            const results = await this.installer.searchMarket(query)
            return results
          }
        }
      },

      // --- 从市场安装 ---
      {
        type: 'tool',
        name: 'skill_market_install',
        description: '从技能市场安装',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { skillId } = p as { skillId: string }
            const result = await this.installer.installFromMarket(skillId)
            if (result.success && result.skillId) {
              const skillDirs = (this.context.config.skillSearchPaths ?? [])
              if (skillDirs.length > 0) {
                await this.discovery.discover(skillDirs)
              }
            }
            return result
          }
        }
      },

      // --- 从 URL 安装 ---
      {
        type: 'tool',
        name: 'skill_install_url',
        description: '从 URL 安装技能',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { url } = p as { url: string }
            const result = await this.installer.installFromUrl(url)
            if (result.success && result.skillId) {
              const skillDirs = (this.context.config.skillSearchPaths ?? [])
              if (skillDirs.length > 0) {
                await this.discovery.discover(skillDirs)
              }
            }
            return result
          }
        }
      },

      // --- 检查更新 ---
      {
        type: 'tool',
        name: 'skill_update_check',
        description: '检查技能可用更新',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async () => {
            const updates = await this.installer.checkUpdates()
            return updates
          }
        }
      },

      // --- 执行更新 ---
      {
        type: 'tool',
        name: 'skill_update_run',
        description: '更新指定技能',
        priority: 10,
        moduleId: this.id,
        handler: {
          execute: async (p) => {
            const { skillId } = p as { skillId: string }
            const result = await this.installer.update(skillId)
            if (result.success) {
              const skillDirs = (this.context.config.skillSearchPaths ?? [])
              if (skillDirs.length > 0) {
                await this.discovery.discover(skillDirs)
              }
            }
            return result
          }
        }
      }
    ]
  }
}
