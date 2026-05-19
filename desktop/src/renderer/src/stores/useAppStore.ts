import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

/** 支持的面板类型，包含模块专属页面 */
export type PanelId = 'chat' | 'skills' | 'settings' | 'modules' | 'live2d' | 'live2d5'
  | 'knowledge-base' | 'translator' | 'workflow' | 'shortcuts'
  | 'clipboard-history' | 'notifications' | 'multi-session'
  | 'calendar' | 'quick-preview' | 'system-dashboard'
  | 'theme-store' | 'code-snippets'
  | 'memory' | 'task' | 'vision' | 'screen' | 'proactive'
  | null

interface AppState {
  initialized: boolean
  language: string
  activePanel: PanelId
  showChangesPanel: boolean
  setInitialized: (value: boolean) => void
  setLanguage: (lang: string) => void
  setActivePanel: (panel: PanelId) => void
  setShowChangesPanel: (v: boolean) => void
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set) => ({
    initialized: false,
    language: 'zh-CN',
    activePanel: 'chat',
    showChangesPanel: false,
    setInitialized: (value) => set({ initialized: value }),
    setLanguage: (language) => set({ language }),
    setActivePanel: (panel) => set({ activePanel: panel }),
    setShowChangesPanel: (v) => set({ showChangesPanel: v })
  }))
)
