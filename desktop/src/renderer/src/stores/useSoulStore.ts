/**
 * SOUL 状态管理 - 渲染进程
 * 管理助手人格配置的前端状态
 */

import { create } from 'zustand'
import type { SoulConfig, SoulCreateRequest, SoulStatus } from '../../../shared/types/soul'

interface SoulState {
  /** 当前 SOUL 状态 */
  status: SoulStatus
  /** SOUL 配置（null 表示未创建） */
  soul: SoulConfig | null
  /** 是否正在显示首次引导 */
  showOnboarding: boolean

  /** 初始化 SOUL（检查本地配置） */
  initialize: () => Promise<void>
  /** 创建 SOUL */
  createSoul: (request: SoulCreateRequest) => Promise<SoulConfig | null>
  /** 更新 SOUL */
  updateSoul: (updates: Partial<SoulCreateRequest>) => Promise<void>
  /** 重置 SOUL */
  resetSoul: () => Promise<void>
  /** 显示/隐藏引导界面 */
  setShowOnboarding: (show: boolean) => void
}

export const useSoulStore = create<SoulState>()((set, get) => ({
  status: 'none',
  soul: null,
  showOnboarding: false,

  initialize: async () => {
    set({ status: 'loading' })
    try {
      const result = (await window.electronAPI.invoke('soul:initialize')) as {
        status: 'none' | 'ready'
        soul: SoulConfig | null
      }

      set({
        status: result.status === 'ready' ? 'ready' : 'none',
        soul: result.soul,
        showOnboarding: result.status === 'none',
      })

      if (result.status === 'ready') {
        console.log(`[SoulStore] ✅ SOUL 已就绪: ${result.soul?.name} ${result.soul?.emoji}`)
      } else {
        console.log('[SoulStore] 📝 需要首次引导')
      }
    } catch (err) {
      console.error('[SoulStore] ❌ 初始化失败:', err)
      set({ status: 'error', showOnboarding: true })
    }
  },

  createSoul: async (request) => {
    try {
      const soul = (await window.electronAPI.invoke('soul:create', request)) as SoulConfig
      set({ soul, status: 'ready', showOnboarding: false })
      console.log(`[SoulStore] 🎉 SOUL 创建成功: ${soul.name} ${soul.emoji}`)
      return soul
    } catch (err) {
      console.error('[SoulStore] ❌ 创建失败:', err)
      return null
    }
  },

  updateSoul: async (updates) => {
    try {
      const soul = (await window.electronAPI.invoke('soul:update', updates)) as SoulConfig
      set({ soul })
    } catch (err) {
      console.error('[SoulStore] ❌ 更新失败:', err)
    }
  },

  resetSoul: async () => {
    try {
      await window.electronAPI.invoke('soul:reset')
      set({ soul: null, status: 'none', showOnboarding: true })
      console.log('[SoulStore] 🗑️ SOUL 已重置')
    } catch (err) {
      console.error('[SoulStore] ❌ 重置失败:', err)
    }
  },

  setShowOnboarding: (show) => set({ showOnboarding: show }),
}))
