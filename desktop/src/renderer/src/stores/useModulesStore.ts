/**
 * 增强版模块 Store
 * 增加 startModule / stopModule / refreshResources
 * 版块25 - 设置面板增强
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { ResourceSnapshot } from '../components/modules/ResourceDashboard'

export type ModuleStatus = 'discovered' | 'loading' | 'active' | 'disabled' | 'error'

export interface ModuleInfo {
  id: string
  name: string
  version: string
  description: string
  icon?: string
  enabled: boolean
  /** 模块生命周期状态 */
  status?: ModuleStatus
  /** 模块作者 */
  author?: string
  /** 模块提供的能力列表 */
  capabilities?: string[]
  /** 模块所需权限列表 */
  permissions?: string[]
  /** 模块依赖的其他模块 ID */
  dependencies?: string[]
  /** 错误信息（当 status === 'error' 时） */
  error?: string
}

interface ModuleState {
  /** 模块列表 */
  modules: ModuleInfo[]
  /** 选中的模块 ID */
  selectedModuleId: string | null
  /** 加载状态 */
  loading: boolean
  /** 错误信息 */
  error: string | null

  /** 设置模块列表 */
  setModules: (modules: ModuleInfo[]) => void
  /** 更新模块信息 */
  updateModule: (id: string, updates: Partial<ModuleInfo>) => void
  /** 切换模块启用状态 */
  toggleModule: (id: string) => void
  /** 选中模块 */
  selectModule: (id: string | null) => void
  /** 启动模块 */
  startModule: (id: string) => Promise<void>
  /** 停止模块 */
  stopModule: (id: string) => Promise<void>
  /** 刷新系统资源 */
  refreshResources: () => Promise<ResourceSnapshot | null>
}

export const useModulesStore = create<ModuleState>()(
  subscribeWithSelector((set, get) => ({
    modules: [],
    selectedModuleId: null,
    loading: false,
    error: null,

    setModules: (modules) => set({ modules, loading: false }),

    updateModule: (id, updates) =>
      set((state) => ({
        modules: state.modules.map((m) =>
          m.id === id ? { ...m, ...updates } : m
        ),
      })),

    toggleModule: (id) => {
      const module = get().modules.find((m) => m.id === id)
      if (!module) return
      const newEnabled = !module.enabled
      // 更新本地状态（乐观更新，不回滚）
      // 同步 enabled 和 status 字段
      set((state) => ({
        modules: state.modules.map((m) =>
          m.id === id
            ? {
                ...m,
                enabled: newEnabled,
                status: newEnabled ? 'active' : 'disabled'
              }
            : m
        ),
      }))
      // 通知主进程（用户意图已在主进程持久化，失败不回滚 UI）
      const action = newEnabled ? 'module:enable' : 'module:disable'
      window.electronAPI
        .invoke(action, { moduleId: id })
        .then((success: boolean) => {
          if (!success) {
            // IPC 返回 false，标记为 error 状态
            set((state) => ({
              modules: state.modules.map((m) =>
                m.id === id ? { ...m, status: 'error' as ModuleStatus, error: '模块加载失败' } : m
              ),
            }))
            console.warn(`[ModulesStore] ${action} 返回 false，模块可能加载失败`)
          }
        })
        .catch((err: unknown) => {
          console.error(`[ModulesStore] ${action} 调用异常:`, err)
        })
    },

    selectModule: (id) => set({ selectedModuleId: id }),

    /** 启动模块 */
    startModule: async (id: string) => {
      try {
        set({ loading: true, error: null })
        // 设置 loading 状态
        set((state) => ({
          modules: state.modules.map((m) =>
            m.id === id ? { ...m, status: 'loading' as ModuleStatus } : m
          ),
        }))
        await window.electronAPI.invoke('module:enable', { moduleId: id })
        set((state) => ({
          modules: state.modules.map((m) =>
            m.id === id ? { ...m, enabled: true, status: 'active' as ModuleStatus } : m
          ),
          loading: false,
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        set((state) => ({
          modules: state.modules.map((m) =>
            m.id === id ? { ...m, status: 'error' as ModuleStatus, error: message } : m
          ),
          error: `启动模块失败: ${message}`,
          loading: false,
        }))
      }
    },

    /** 停止模块 */
    stopModule: async (id: string) => {
      try {
        set({ loading: true, error: null })
        await window.electronAPI.invoke('module:disable', { moduleId: id })
        set((state) => ({
          modules: state.modules.map((m) =>
            m.id === id ? { ...m, enabled: false, status: 'disabled' as ModuleStatus } : m
          ),
          loading: false,
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        set((state) => ({
          modules: state.modules.map((m) =>
            m.id === id ? { ...m, status: 'error' as ModuleStatus, error: message } : m
          ),
          error: `停止模块失败: ${message}`,
          loading: false,
        }))
      }
    },

    /** 刷新系统资源数据 */
    refreshResources: async (): Promise<ResourceSnapshot | null> => {
      try {
        const result = await window.electronAPI.invoke('config:get', {
          key: 'performance:snapshot',
        })
        if (result && typeof result === 'object') {
          return result as ResourceSnapshot
        }
        return null
      } catch {
        return null
      }
    },
  }))
)
