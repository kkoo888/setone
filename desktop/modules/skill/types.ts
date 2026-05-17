/**
 * 技能模块类型定义
 * 涵盖技能元数据、权限、扫描结果、统计等完整类型体系
 */

/** 技能元数据级别 */
export const SkillLevel = { META: 'meta', DESCRIPTION: 'description', FULL: 'full' } as const
export type SkillLevelValue = (typeof SkillLevel)[keyof typeof SkillLevel]

/** 技能权限声明 */
export type Permission =
  | 'file.read'
  | 'file.write'
  | 'network'
  | 'exec'
  | 'screen'
  | 'clipboard'
  | 'notification'

/** 安装来源 */
export type InstallSource = 'local' | 'market' | 'url'

/** 技能元数据 */
export interface SkillMeta {
  id: string
  name: string
  description: string
  version: string
  author: string
  path: string
  icon?: string
  tags: string[]
  permissions: Permission[]
  level: SkillLevelValue
  active: boolean
  installSource: InstallSource
  installedAt: number
  lastUsedAt?: number
  useCount: number
  avgDuration?: number
  config?: Record<string, unknown>
}

/** 技能定义（包含运行时内容） */
export interface SkillDefinition {
  meta: SkillMeta
  content?: string
  instructions?: string
  execute?: (params: Record<string, unknown>) => Promise<unknown>
}

/** 创建技能参数 */
export interface CreateSkillParams {
  name: string
  description: string
  tags: string[]
  permissions: Permission[]
  template?: 'blank' | 'from-existing'
  basedOn?: string
  aiInstruction?: string
}

/** 权限检查结果 */
export interface PermissionCheck {
  permission: Permission
  declared: boolean
  detected: boolean
  risk: 'low' | 'medium' | 'high'
  note: string
}

/** 依赖检查结果 */
export interface DependencyCheck {
  name: string
  required: string
  satisfied: boolean
  installed?: string
  hint?: string
}

/** 兼容性检查结果 */
export interface CompatibilityCheck {
  compatible: boolean
  minVersion?: string
  currentVersion?: string
  reason?: string
}

/** 扫描结果 */
export interface ScanResult {
  safe: boolean
  permissions: PermissionCheck[]
  dependencies: DependencyCheck[]
  compatibility: CompatibilityCheck
  warnings: string[]
}

/** 技能统计 */
export interface SkillStats {
  skillId: string
  totalCalls: number
  successCount: number
  failCount: number
  avgDuration: number
  lastUsedAt: number
  dailyUsage: Record<string, number>
}

/** 技能链步骤 */
export interface SkillChainStep {
  skillId: string
  params?: Record<string, unknown>
  outputMapping?: string
}

/** 技能链 */
export interface SkillChain {
  id: string
  name: string
  description: string
  steps: SkillChainStep[]
}

/** 持久化状态条目 */
export interface SkillStateEntry {
  active: boolean
  config?: Record<string, unknown>
  installedAt: number
  lastUsedAt?: number
  useCount: number
  totalDuration: number
}

/** 导入结果 */
export interface ImportResult {
  success: boolean
  skillId?: string
  skillName?: string
  scanResult?: ScanResult
  error?: string
  warnings?: string[]
}

/** 持久化状态文件结构 */
export interface SkillStateFile {
  skills: Record<string, SkillStateEntry>
  chains: SkillChain[]
  trash: Array<{ id: string; deletedAt: number; path: string }>
}

/** 市场技能信息 */
export interface MarketSkill {
  id: string
  name: string
  description: string
  version: string
  author: string
  downloads: number
  rating: number
  tags: string[]
}

/** 安装结果 */
export interface InstallResult {
  success: boolean
  skillId?: string
  error?: string
  scanResult?: ScanResult
}

/** 更新信息 */
export interface UpdateInfo {
  skillId: string
  currentVersion: string
  latestVersion: string
  changelog?: string
}
