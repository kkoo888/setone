import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

/** 支持的面板类型，包含模块专属页面 */
export type PanelId = 'chat' | 'skills' | 'settings' | 'modules' | 'live2d'
  | 'knowledge-base' | 'translator' | 'workflow' | 'shortcuts'
  | 'clipboard-history' | 'notifications' | 'multi-session'
  | 'calendar' | 'quick-preview' | 'system-dashboard'
  | 'theme-store' | 'code-snippets'
  | 'workflow' | 'knowledge-base' | 'translator' | 'memory' | 'task'
  | 'vision' | 'screen' | 'proactive' | null

interface AppState {
  initialized: boolean
  theme: 'light' | 'dark' | 'system'
  language: string
  activePanel: PanelId
  showChangesPanel: boolean
  setInitialized: (value: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setLanguage: (lang: string) => void
  setActivePanel: (panel: PanelId) => void
  setShowChangesPanel: (v: boolean) => void
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set) => ({
    initialized: false,
    theme: 'system',
    language: 'zh-CN',
    activePanel: 'chat',
    showChangesPanel: false,
    setInitialized: (value) => set({ initialized: value }),
    setTheme: (theme) => set({ theme }),
    setLanguage: (language) => set({ language }),
    setActivePanel: (panel) => set({ activePanel: panel }),
    setShowChangesPanel: (v) => set({ showChangesPanel: v })
  }))
)
