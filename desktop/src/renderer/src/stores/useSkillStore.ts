/**
 * 技能状态管理 Store
 * 管理技能列表、筛选、选中状态、回收站等
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { useSettingsStore } from './useSettingsStore'

/** 技能权限类型 */
export type Permission =
  | 'file.read'
  | 'file.write'
  | 'network'
  | 'exec'
  | 'screen'
  | 'clipboard'
  | 'notification'

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
  level: 'meta' | 'description' | 'full'
  active: boolean
  installSource: 'local' | 'market' | 'url'
  installedAt: number
  lastUsedAt?: number
  useCount: number
  avgDuration?: number
  config?: Record<string, unknown>
}

/** 回收站条目 */
export interface TrashItem {
  id: string
  deletedAt: number
  path: string
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

/** 更新信息 */
export interface UpdateInfo {
  skillId: string
  currentVersion: string
  latestVersion: string
  changelog?: string
}

/** 安装结果 */
export interface InstallResult {
  success: boolean
  skillId?: string
  error?: string
  scanResult?: unknown
}

/** 工作流步骤 */
export interface WorkflowStep {
  skillId: string
  params?: Record<string, unknown>
  condition?: string
}

/** 工作流定义 */
export interface SkillWorkflow {
  id: string
  name: string
  description: string
  steps: WorkflowStep[]
  createdAt: number
}

/** 使用记录 */
export interface SkillUsageRecord {
  skillId: string
  timestamp: number
  duration: number
  success: boolean
  errorMessage?: string
}

/** 技能统计数据 */
export interface SkillStatsData {
  skillId: string
  totalCalls: number
  successCount: number
  failureCount: number
  lastUsedAt: number | null
  avgDuration: number
  recentRecords: SkillUsageRecord[]
}

/** 技能状态 */
interface SkillState {
  /** 技能列表 */
  skills: SkillMeta[]
  /** 当前激活的分类标签 */
  activeTag: string
  /** 搜索关键词 */
  searchQuery: string
  /** 选中的技能 ID（用于详情面板） */
  selectedSkillId: string | null
  /** 二级导航标签 */
  activeTab: string
  /** 加载状态 */
  loading: boolean
  /** 错误信息 */
  error: string | null
  /** 回收站列表 */
  trash: TrashItem[]
  /** 回收站加载状态 */
  trashLoading: boolean
  /** 安装弹窗可见性 */
  installDialogOpen: boolean
  /** 更新弹窗可见性 */
  updateDialogOpen: boolean
  /** 市场搜索结果 */
  marketResults: MarketSkill[]
  /** 市场搜索加载中 */
  marketLoading: boolean
  /** 安装进度信息 */
  installProgress: string | null
  /** 可更新列表 */
  updateList: UpdateInfo[]
  /** 生成新技能弹窗可见性 */
  createDialogOpen: boolean
  /** 炼化面板可见性 */
  refinePanelOpen: boolean
  /** 炼化目标技能 ID */
  refineTarget: string | null
  /** 工作流列表 */
  workflows: SkillWorkflow[]
  /** 工作流面板可见性 */
  chainPanelOpen: boolean
  /** 统计面板可见性 */
  statsPanelOpen: boolean
  /** 统计数据 */
  statsList: SkillStatsData[]
  /** 统计加载状态 */
  statsLoading: boolean

  /** 设置技能列表 */
  setSkills: (skills: SkillMeta[]) => void
  /** 切换技能激活状态 */
  toggleSkill: (id: string) => void
  /** 设置激活标签 */
  setActiveTag: (tag: string) => void
  /** 设置搜索关键词 */
  setSearchQuery: (query: string) => void
  /** 选中技能（打开详情） */
  selectSkill: (id: string | null) => void
  /** 设置二级导航标签 */
  setActiveTab: (tab: string) => void
  /** 加载技能列表 */
  loadSkills: () => Promise<void>
  scanSkills: () => Promise<void>
  /** 加载回收站列表 */
  loadTrash: () => Promise<void>
  /** 恢复技能（从回收站） */
  restoreSkill: (id: string) => Promise<boolean>
  /** 清空回收站 */
  emptyTrash: () => Promise<boolean>
  /** 永久删除 */
  permanentDelete: (id: string) => Promise<boolean>
  /** 加载技能配置 */
  loadSkillConfig: (id: string) => Promise<Record<string, unknown>>
  /** 保存技能配置 */
  saveSkillConfig: (id: string, config: Record<string, unknown>) => Promise<boolean>
  /** 打开/关闭安装弹窗 */
  setInstallDialogOpen: (open: boolean) => void
  /** 打开/关闭更新弹窗 */
  setUpdateDialogOpen: (open: boolean) => void
  /** 搜索市场 */
  searchMarket: (query: string) => Promise<void>
  /** 从市场安装 */
  installFromMarket: (skillId: string) => Promise<boolean>
  /** 从 URL 安装 */
  installFromUrl: (url: string) => Promise<boolean>
  /** 检查更新 */
  checkUpdates: () => Promise<void>
  /** 更新技能 */
  updateSkill: (skillId: string) => Promise<boolean>
  /** 导出技能 */
  exportSkill: (skillId: string) => Promise<string | null>
  /** 导入技能 */
  importSkill: (archivePath: string) => Promise<boolean>
  /** 打开/关闭生成新技能弹窗 */
  setCreateDialogOpen: (open: boolean) => void
  /** 打开/关闭炼化面板 */
  setRefinePanelOpen: (open: boolean, skillId?: string) => void
  /** 创建技能（AI 辅助） */
  createSkill: (description: string) => Promise<boolean>
  /** 炼化优化技能 */
  refineSkill: (id: string, instruction: string) => Promise<{ before: string; after: string }>
  /** 打开/关闭工作流面板 */
  setChainPanelOpen: (open: boolean) => void
  /** 打开/关闭统计面板 */
  setStatsPanelOpen: (open: boolean) => void
  /** 加载工作流列表 */
  loadWorkflows: () => Promise<void>
  /** 创建工作流 */
  createWorkflow: (name: string, steps: WorkflowStep[]) => Promise<boolean>
  /** 执行工作流 */
  executeWorkflow: (id: string) => Promise<boolean>
  /** 删除工作流 */
  deleteWorkflow: (id: string) => Promise<boolean>
  /** 加载使用统计 */
  loadStats: () => Promise<void>
}

export const useSkillStore = create<SkillState>()(
  subscribeWithSelector((set, get) => ({
    skills: [],
    activeTag: '全部',
    searchQuery: '',
    selectedSkillId: null,
    activeTab: '推荐',
    loading: false,
    error: null,
    trash: [],
    trashLoading: false,
    installDialogOpen: false,
    updateDialogOpen: false,
    marketResults: [],
    marketLoading: false,
    installProgress: null,
    updateList: [],
    createDialogOpen: false,
    refinePanelOpen: false,
    refineTarget: null,
    workflows: [],
    chainPanelOpen: false,
    statsPanelOpen: false,
    statsList: [],
    statsLoading: false,

    /** 检查网络是否可用 */
    _assertNetwork: (): boolean => {
      const enabled = useSettingsStore.getState().settings.networkEnabled
      if (!enabled) {
        console.warn('[SkillStore] 网络已断开，操作被拦截')
      }
      return enabled
    },

    setSkills: (skills) => set({ skills, loading: false }),

    toggleSkill: (id) => {
      const skill = get().skills.find((s) => s.id === id)
      if (!skill) return

      const newActive = !skill.active
      // 乐观更新
      set((state) => ({
        skills: state.skills.map((s) =>
          s.id === id ? { ...s, active: newActive } : s
        )
      }))

      // 通知主进程
      window.electronAPI
        .invoke('skill:toggle', { id, active: newActive })
        .then((result: unknown) => {
          const res = result as { success?: boolean; error?: string }
          if (!res?.success) {
            console.warn(`[SkillStore] toggle 返回失败: ${res?.error}`)
          }
        })
        .catch((err: unknown) => {
          console.error('[SkillStore] toggle 调用异常:', err)
        })
    },

    setActiveTag: (tag) => set({ activeTag: tag }),

    setSearchQuery: (query) => set({ searchQuery: query }),

    selectSkill: (id) => set({ selectedSkillId: id }),

    setActiveTab: (tab) => set({ activeTab: tab }),

    loadSkills: async () => {
      set({ loading: true, error: null })
      try {
        const result = await window.electronAPI.invoke('skill:list')
        if (Array.isArray(result)) {
          set({ skills: result as SkillMeta[], loading: false })
        } else {
          const res = result as { success?: boolean; data?: SkillMeta[]; error?: string }
          if (res?.success && Array.isArray(res.data)) {
            set({ skills: res.data, loading: false })
          } else {
            set({ skills: [], loading: false })
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        set({ error: `加载技能失败: ${message}`, loading: false })
      }
    },

    scanSkills: async () => {
      set({ loading: true, error: null })
      try {
        // 先触发重新扫描技能目录
        await window.electronAPI.invoke('skill:discover', { dirs: [] })
        // 再重新加载列表
        const result = await window.electronAPI.invoke('skill:list')
        if (Array.isArray(result)) {
          set({ skills: result as SkillMeta[], loading: false })
        } else {
          const res = result as { success?: boolean; data?: SkillMeta[]; error?: string }
          if (res?.success && Array.isArray(res.data)) {
            set({ skills: res.data, loading: false })
          } else {
            set({ loading: false })
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        set({ error: `扫描技能失败: ${message}`, loading: false })
      }
    },

    loadTrash: async () => {
      set({ trashLoading: true })
      try {
        const result = await window.electronAPI.invoke('skill:trash:list')
        const res = result as { success?: boolean; data?: TrashItem[] }
        if (res?.success && Array.isArray(res.data)) {
          set({ trash: res.data, trashLoading: false })
        } else {
          set({ trash: [], trashLoading: false })
        }
      } catch (err) {
        console.error('[SkillStore] 加载回收站失败:', err)
        set({ trash: [], trashLoading: false })
      }
    },

    restoreSkill: async (id) => {
      try {
        const result = await window.electronAPI.invoke('skill:trash:restore', { id })
        const res = result as { success?: boolean; error?: string }
        if (res?.success) {
          // 从回收站列表移除
          set((state) => ({
            trash: state.trash.filter((t) => t.id !== id)
          }))
          // 重新加载技能列表
          await get().loadSkills()
          return true
        }
        console.warn(`[SkillStore] 恢复失败: ${res?.error}`)
        return false
      } catch (err) {
        console.error('[SkillStore] 恢复技能异常:', err)
        return false
      }
    },

    emptyTrash: async () => {
      try {
        const result = await window.electronAPI.invoke('skill:trash:empty')
        const res = result as { success?: boolean }
        if (res?.success) {
          set({ trash: [] })
          return true
        }
        return false
      } catch (err) {
        console.error('[SkillStore] 清空回收站异常:', err)
        return false
      }
    },

    permanentDelete: async (id) => {
      try {
        const result = await window.electronAPI.invoke('skill:trash:delete', { id })
        const res = result as { success?: boolean; error?: string }
        if (res?.success) {
          set((state) => ({
            trash: state.trash.filter((t) => t.id !== id)
          }))
          return true
        }
        console.warn(`[SkillStore] 永久删除失败: ${res?.error}`)
        return false
      } catch (err) {
        console.error('[SkillStore] 永久删除异常:', err)
        return false
      }
    },

    loadSkillConfig: async (id) => {
      try {
        const result = await window.electronAPI.invoke('skill:config', { id })
        const res = result as { success?: boolean; data?: Record<string, unknown> }
        if (res?.success && res.data) {
          return res.data
        }
        return {}
      } catch (err) {
        console.error('[SkillStore] 加载配置异常:', err)
        return {}
      }
    },

    saveSkillConfig: async (id, config) => {
      try {
        const result = await window.electronAPI.invoke('skill:config', { id, config })
        const res = result as { success?: boolean }
        if (res?.success) {
          // 乐观更新本地技能列表
          set((state) => ({
            skills: state.skills.map((s) =>
              s.id === id ? { ...s, config } : s
            )
          }))
          return true
        }
        return false
      } catch (err) {
        console.error('[SkillStore] 保存配置异常:', err)
        return false
      }
    },

    setInstallDialogOpen: (open) => set({
      installDialogOpen: open,
      marketResults: open ? get().marketResults : [],
      installProgress: null
    }),

    setUpdateDialogOpen: (open) => set({ updateDialogOpen: open }),

    searchMarket: async (query) => {
      if (!query.trim()) {
        set({ marketResults: [] })
        return
      }
      if (!get()._assertNetwork()) {
        set({ marketResults: [], marketLoading: false })
        return
      }
      set({ marketLoading: true })
      try {
        const result = await window.electronAPI.invoke('skill:market:search', { query })
        const results = Array.isArray(result) ? result as MarketSkill[] : []
        set({ marketResults: results, marketLoading: false })
      } catch (err) {
        console.error('[SkillStore] 市场搜索异常:', err)
        set({ marketResults: [], marketLoading: false })
      }
    },

    installFromMarket: async (skillId) => {
      if (!get()._assertNetwork()) return false
      set({ installProgress: `正在安装 ${skillId}...` })
      try {
        const result = await window.electronAPI.invoke('skill:market:install', { skillId })
        const res = result as InstallResult
        if (res?.success) {
          set({ installProgress: '安装完成，正在刷新...' })
          await get().loadSkills()
          set({ installProgress: null })
          return true
        }
        set({ installProgress: null })
        console.warn(`[SkillStore] 市场安装失败: ${res?.error}`)
        return false
      } catch (err) {
        console.error('[SkillStore] 市场安装异常:', err)
        set({ installProgress: null })
        return false
      }
    },

    installFromUrl: async (url) => {
      if (!get()._assertNetwork()) return false
      set({ installProgress: '正在从 URL 安装...' })
      try {
        const result = await window.electronAPI.invoke('skill:install:url', { url })
        const res = result as InstallResult
        if (res?.success) {
          set({ installProgress: '安装完成，正在刷新...' })
          await get().loadSkills()
          set({ installProgress: null })
          return true
        }
        set({ installProgress: null })
        console.warn(`[SkillStore] URL 安装失败: ${res?.error}`)
        return false
      } catch (err) {
        console.error('[SkillStore] URL 安装异常:', err)
        set({ installProgress: null })
        return false
      }
    },

    checkUpdates: async () => {
      if (!get()._assertNetwork()) {
        set({ updateList: [] })
        return
      }
      try {
        const result = await window.electronAPI.invoke('skill:update:check')
        const updates = Array.isArray(result) ? result as UpdateInfo[] : []
        set({ updateList: updates })
      } catch (err) {
        console.error('[SkillStore] 检查更新异常:', err)
        set({ updateList: [] })
      }
    },

    updateSkill: async (skillId) => {
      if (!get()._assertNetwork()) return false
      set({ installProgress: `正在更新 ${skillId}...` })
      try {
        const result = await window.electronAPI.invoke('skill:update:run', { skillId })
        const res = result as InstallResult
        if (res?.success) {
          // 从更新列表移除
          set((state) => ({
            updateList: state.updateList.filter((u) => u.skillId !== skillId),
            installProgress: '更新完成，正在刷新...'
          }))
          await get().loadSkills()
          set({ installProgress: null })
          return true
        }
        set({ installProgress: null })
        console.warn(`[SkillStore] 更新失败: ${res?.error}`)
        return false
      } catch (err) {
        console.error('[SkillStore] 更新异常:', err)
        set({ installProgress: null })
        return false
      }
    },

    exportSkill: async (skillId) => {
      try {
        const result = await window.electronAPI.invoke('skill:export', { id: skillId })
        const res = result as { success?: boolean; data?: { filePath?: string }; error?: string }
        if (res?.success && res.data?.filePath) {
          return res.data.filePath
        }
        console.warn(`[SkillStore] 导出失败: ${res?.error}`)
        return null
      } catch (err) {
        console.error('[SkillStore] 导出异常:', err)
        return null
      }
    },

    importSkill: async (archivePath) => {
      try {
        const result = await window.electronAPI.invoke('skill:import', { archivePath })
        const res = result as { success?: boolean; error?: string }
        if (res?.success) {
          // 重新加载技能列表
          await get().loadSkills()
          return true
        }
        console.warn(`[SkillStore] 导入失败: ${res?.error}`)
        return false
      } catch (err) {
        console.error('[SkillStore] 导入异常:', err)
        return false
      }
    },

    setCreateDialogOpen: (open) => set({ createDialogOpen: open }),

    setRefinePanelOpen: (open, skillId) => set({
      refinePanelOpen: open,
      refineTarget: open ? (skillId ?? null) : null
    }),

    createSkill: async (description) => {
      try {
        const result = await window.electronAPI.invoke('skill:create', {
          name: description.slice(0, 30),
          description,
          tags: ['自定义'],
          permissions: [],
          aiInstruction: description
        })
        const res = result as { success?: boolean; error?: string }
        if (res?.success) {
          await get().loadSkills()
          return true
        }
        console.warn(`[SkillStore] 创建技能失败: ${res?.error}`)
        return false
      } catch (err) {
        console.error('[SkillStore] 创建技能异常:', err)
        return false
      }
    },

    refineSkill: async (id, instruction) => {
      const result = await window.electronAPI.invoke('skill:refine', { id, instruction })
      const res = result as {
        success?: boolean
        data?: { before?: string; after?: string; changes?: string[] }
        error?: string
      }
      if (res?.success && res.data) {
        return {
          before: res.data.before ?? '',
          after: res.data.after ?? ''
        }
      }
      throw new Error(res?.error ?? '炼化失败')
    },

    setChainPanelOpen: (open) => set({ chainPanelOpen: open }),

    setStatsPanelOpen: (open) => set({ statsPanelOpen: open }),

    loadWorkflows: async () => {
      try {
        const result = await window.electronAPI.invoke('skill:chain:list')
        const res = result as { success?: boolean; data?: SkillWorkflow[] }
        if (res?.success && Array.isArray(res.data)) {
          set({ workflows: res.data })
        } else if (Array.isArray(result)) {
          set({ workflows: result as SkillWorkflow[] })
        }
      } catch (err) {
        console.error('[SkillStore] 加载工作流失败:', err)
      }
    },

    createWorkflow: async (name, steps) => {
      try {
        const result = await window.electronAPI.invoke('skill:chain:create', { name, steps })
        const res = result as { success?: boolean; data?: SkillWorkflow }
        if (res?.success) {
          await get().loadWorkflows()
          return true
        }
        console.warn('[SkillStore] 创建工作流失败')
        return false
      } catch (err) {
        console.error('[SkillStore] 创建工作流异常:', err)
        return false
      }
    },

    executeWorkflow: async (id) => {
      try {
        const result = await window.electronAPI.invoke('skill:chain:execute', { chainId: id })
        const res = result as { success?: boolean }
        return !!res?.success
      } catch (err) {
        console.error('[SkillStore] 执行工作流异常:', err)
        return false
      }
    },

    deleteWorkflow: async (id) => {
      try {
        const result = await window.electronAPI.invoke('skill:chain:delete', { id })
        const res = result as { success?: boolean }
        if (res?.success) {
          await get().loadWorkflows()
          return true
        }
        return false
      } catch (err) {
        console.error('[SkillStore] 删除工作流异常:', err)
        return false
      }
    },

    loadStats: async () => {
      set({ statsLoading: true })
      try {
        const result = await window.electronAPI.invoke('skill:stats')
        const res = result as { success?: boolean; data?: SkillStatsData[] }
        if (res?.success && Array.isArray(res.data)) {
          set({ statsList: res.data, statsLoading: false })
        } else {
          set({ statsList: [], statsLoading: false })
        }
      } catch (err) {
        console.error('[SkillStore] 加载统计失败:', err)
        set({ statsList: [], statsLoading: false })
      }
    }
  }))
)
