/**
 * 增强版设置 Store
 * 增加 loadFromMainProcess / saveToMainProcess / resetToDefaults
 * 版块25 - 设置面板增强
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  AppSettings,
  OllamaConfig,
  AppearanceSettings,
  PerformanceMonitorSettings,
  LogLevel,
} from '../types/settings'

/** AI 设置（保持向后兼容） */
export interface AISettings {
  provider: string
  model: string
  apiKey: string
  baseUrl: string
  temperature: number
  maxTokens: number
}

/** 向后兼容的旧版 AppSettings 类型 */
export type LegacyAppSettings = AppSettings

interface SettingsState {
  /** 完整设置对象 */
  settings: AppSettings
  /** 是否已从主进程加载 */
  loaded: boolean
  /** 设置加载中 */
  loading: boolean

  /** 更新顶层设置（向后兼容） */
  setSettings: (updates: Partial<AppSettings>) => void
  /** 更新 AI 设置 */
  setAISettings: (ai: Partial<AISettings>) => void
  /** 更新 Ollama 配置 */
  setOllamaConfig: (config: Partial<OllamaConfig>) => void
  /** 更新外观设置 */
  setAppearance: (appearance: Partial<AppearanceSettings>) => void
  /** 更新通用设置 */
  setGeneralSettings: (general: Partial<AppSettings['general']>) => void
  /** 更新性能监控设置 */
  setPerformanceMonitorSettings: (settings: Partial<PerformanceMonitorSettings>) => void
  /** 更新头像 */
  setAvatar: (avatar: string) => void
  /** 更新助手名称 */
  setAssistantName: (name: string) => void
  /** 更新网络开关 */
  setNetworkEnabled: (enabled: boolean) => void
  /** 设置加载状态 */
  setLoaded: (value: boolean) => void
  /** 从主进程加载设置 */
  loadFromMainProcess: () => Promise<void>
  /** 保存设置到主进程 */
  saveToMainProcess: () => Promise<void>
  /** 恢复默认设置 */
  resetToDefaults: () => void
  /** 旧版 resetSettings（向后兼容） */
  resetSettings: () => void
}

/** 默认设置 */
const defaultSettings: AppSettings = {
  avatar: '',
  ai: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    temperature: 0.7,
    maxTokens: 4096,
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'ministral:3b',
    visionModel: 'llava',
    embeddingModel: 'nomic-embed-text',
    timeout: 30000,
    autoStart: false,
  },
  appearance: {
    theme: 'light',
    language: 'zh-CN',
    fontSize: 14,
    sidebarCollapsed: false,
  },
  general: {
    autostart: false,
    minimizeToTray: true,
    showNotifications: true,
    logLevel: 'info',
  },
  performanceMonitor: {
    enabled: true,
    interval: 5000,
    cpuAlertThreshold: 80,
    memoryAlertThreshold: 85,
    showInStatusBar: true,
  },
  networkEnabled: true,
  assistantName: '小茜',
}

/** 自动保存防抖定时器 */
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
/** 自动保存延迟（ms） */
const AUTO_SAVE_DELAY = 500

/** 触发自动保存（防抖） */
function scheduleAutoSave(get: () => SettingsState): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    void get().saveToMainProcess()
  }, AUTO_SAVE_DELAY)
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set, get) => ({
    settings: defaultSettings,
    loaded: false,
    loading: false,

    setSettings: (updates) => {
      set((state) => ({ settings: { ...state.settings, ...updates } }))
      scheduleAutoSave(get)
    },

    setAISettings: (ai) => {
      set((state) => ({
        settings: { ...state.settings, ai: { ...state.settings.ai, ...ai } },
      }))
      scheduleAutoSave(get)
      // 模型变更立即保存
      if (ai.model !== undefined) {
        void window.electronAPI.invoke('config:set', { key: 'ollama.model', value: ai.model })
      }
    },

    setOllamaConfig: (config) => {
      set((state) => ({
        settings: {
          ...state.settings,
          ollama: { ...state.settings.ollama, ...config },
        },
      }))
      scheduleAutoSave(get)
      // 模型变更立即保存
      if (config.model !== undefined) {
        void window.electronAPI.invoke('config:set', { key: 'ollama.model', value: config.model })
      }
    },

    setAppearance: (appearance) => {
      set((state) => ({
        settings: {
          ...state.settings,
          appearance: { ...state.settings.appearance, ...appearance },
        },
      }))
      scheduleAutoSave(get)
    },

    setGeneralSettings: (general) => {
      set((state) => ({
        settings: {
          ...state.settings,
          general: { ...state.settings.general, ...general },
        },
      }))
      scheduleAutoSave(get)
    },

    setPerformanceMonitorSettings: (perfSettings) => {
      set((state) => ({
        settings: {
          ...state.settings,
          performanceMonitor: {
            ...state.settings.performanceMonitor,
            ...perfSettings,
          },
        },
      }))
      scheduleAutoSave(get)
    },

    setAvatar: (avatar) => {
      set((state) => ({
        settings: { ...state.settings, avatar },
      }))
      scheduleAutoSave(get)
    },

    setAssistantName: (assistantName) => {
      set((state) => ({
        settings: { ...state.settings, assistantName },
      }))
      scheduleAutoSave(get)
    },

    setNetworkEnabled: (networkEnabled) => {
      set((state) => ({
        settings: { ...state.settings, networkEnabled },
      }))
      scheduleAutoSave(get)
    },

    setLoaded: (value) => set({ loaded: value }),

    /** 从主进程加载设置 */
    loadFromMainProcess: async () => {
      set({ loading: true })
      try {
        const [saved, ollamaBase, ollamaModel, ollamaVision, ollamaEmbed, ollamaTimeout] = await Promise.all([
          window.electronAPI.invoke('config:get', { key: 'appSettings' }),
          window.electronAPI.invoke('config:get', { key: 'ollama.baseUrl' }),
          window.electronAPI.invoke('config:get', { key: 'ollama.model' }),
          window.electronAPI.invoke('config:get', { key: 'ollama.visionModel' }),
          window.electronAPI.invoke('config:get', { key: 'ollama.embeddingModel' }),
          window.electronAPI.invoke('config:get', { key: 'ollama.timeout' }),
        ])
        const merged = { ...defaultSettings, ...(saved as Partial<AppSettings>) }
        // 用根级别 ollama 配置覆盖（兼容旧版或外部修改）
        if (ollamaBase && typeof ollamaBase === 'string') merged.ollama.baseUrl = ollamaBase
        if (ollamaModel && typeof ollamaModel === 'string') merged.ollama.model = ollamaModel
        if (ollamaVision && typeof ollamaVision === 'string') merged.ollama.visionModel = ollamaVision
        if (ollamaEmbed && typeof ollamaEmbed === 'string') merged.ollama.embeddingModel = ollamaEmbed
        if (ollamaTimeout && typeof ollamaTimeout === 'number') merged.ollama.timeout = ollamaTimeout

        // 如果没有设置助手名称，尝试从 SOUL.md 读取
        if (!merged.assistantName || merged.assistantName === defaultSettings.assistantName) {
          try {
            const soulName = await window.electronAPI.invoke('soul:readName')
            if (soulName && typeof soulName === 'string') {
              merged.assistantName = soulName
            }
          } catch {
            // soul:readName 不可用时忽略
          }
        }

        set({ settings: merged, loaded: true })
      } catch (err) {
        console.error('[SettingsStore] 加载设置失败:', err)
        set({ loaded: true })
      } finally {
        set({ loading: false })
      }
    },

    /** 保存设置到主进程 */
    saveToMainProcess: async () => {
      try {
        const { settings } = get()
        await window.electronAPI.invoke('config:set', {
          key: 'appSettings',
          value: settings,
        })
        // 同步 Ollama 配置到根级别 key（AI 服务从 ollama.* 读取）
        await Promise.all([
          window.electronAPI.invoke('config:set', { key: 'ollama.baseUrl', value: settings.ollama.baseUrl }),
          window.electronAPI.invoke('config:set', { key: 'ollama.model', value: settings.ollama.model }),
          window.electronAPI.invoke('config:set', { key: 'ollama.visionModel', value: settings.ollama.visionModel }),
          window.electronAPI.invoke('config:set', { key: 'ollama.embeddingModel', value: settings.ollama.embeddingModel }),
          window.electronAPI.invoke('config:set', { key: 'ollama.timeout', value: settings.ollama.timeout }),
        ])
      } catch (err) {
        console.error('[SettingsStore] 保存设置失败:', err)
      }
    },

    /** 恢复默认设置 */
    resetToDefaults: () => {
      set({ settings: defaultSettings })
      // 同步保存到主进程
      void get().saveToMainProcess()
    },

    /** 向后兼容 */
    resetSettings: () => {
      set({ settings: defaultSettings })
    },
  }))
)
