/**
 * useTheme - 主题管理 Hook v2.0
 * 
 * 统一主题入口，替代 MainLayout.tsx 中的旧主题逻辑：
 * 1. 监听 theme:changed IPC 事件
 * 2. 启动时从 config 加载已保存主题
 * 3. mode + theme 解耦
 * 4. 支持 v1/v2 格式主题 JSON
 */
import { useEffect, useCallback, useRef } from 'react'
import { useSettingsStore } from '../stores/useSettingsStore'
import type { ThemeMode } from '../types/settings'
import type { SeedToken, ThemeConfigV2, ThemeConfigV1 } from '../services/themeEngine'
import {
  deriveThemeVariables,
  applyThemeToDOM,
  clearThemeVariables,
  migrateV1ToSeed,
} from '../services/themeEngine'

const THEME_ID_KEY = 'app-theme-id'
const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system', 'compact']

function loadSavedThemeId(): string | null {
  try { return localStorage.getItem(THEME_ID_KEY) } catch { return null }
}

function persistThemeId(id: string): void {
  try { localStorage.setItem(THEME_ID_KEY, id) } catch { /* ignore */ }
}

function getSystemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveMode(theme: ThemeMode): 'light' | 'dark' | 'compact' {
  if (theme === 'system') return getSystemPrefersDark() ? 'dark' : 'light'
  if (theme === 'compact') return 'compact'
  return theme
}

/**
 * 从主题配置 + 当前 mode 生成 SeedToken
 */
function configToSeed(config: ThemeConfigV2 | ThemeConfigV1, mode: ThemeMode): SeedToken {
  let seed: SeedToken
  if ('seed' in config) {
    const v2 = config as ThemeConfigV2
    seed = {
      ...v2.seed,
      radius: v2.seed.radius ?? 8,
      fontBase: v2.seed.fontBase ?? 16,
      spacingBase: v2.seed.spacingBase ?? 8,
    }
  } else {
    seed = migrateV1ToSeed(config as ThemeConfigV1)
  }

  const resolved = mode === 'system' ? (getSystemPrefersDark() ? 'dark' : 'light') : mode
  if (resolved === 'compact') {
    return { ...seed, mode: 'light', spacingBase: 6, fontBase: 14 }
  }
  return { ...seed, mode: resolved as 'light' | 'dark' }
}

/**
 * 应用主题配置到 DOM（统一入口）
 */
function applyThemeConfig(config: ThemeConfigV2 | ThemeConfigV1, mode: ThemeMode): void {
  const seed = configToSeed(config, mode)
  const vars = deriveThemeVariables(seed)
  clearThemeVariables()
  applyThemeToDOM(vars)

  // 应用组件级覆盖
  const v2 = config as ThemeConfigV2
  if (v2.overrides?.component) {
    const root = document.documentElement
    for (const compVars of Object.values(v2.overrides.component)) {
      for (const [key, value] of Object.entries(compVars as Record<string, string>)) {
        root.style.setProperty(key, value)
      }
    }
  }

  // 应用别名覆盖
  if (v2.overrides?.alias) {
    const root = document.documentElement
    for (const [key, value] of Object.entries(v2.overrides.alias as Record<string, string>)) {
      root.style.setProperty(key, value)
    }
  }

  // 设置 data-theme 属性
  const resolved = mode === 'compact' ? 'compact' : resolveMode(mode)
  document.documentElement.setAttribute('data-theme', resolved)
}

/**
 * 根据 ID 加载主题文件并应用
 */
async function loadAndApplyThemeById(id: string, mode: ThemeMode): Promise<void> {
  try {
    const res = await window.electronAPI.invoke('theme_get', { id })
    if (res?.success && res.data) {
      applyThemeConfig(res.data, mode)
    }
  } catch {
    // 加载失败，静默回退
  }
}

// ─── Hook ────────────────────────────────────────────

export function useTheme() {
  const theme = useSettingsStore((s) => s.settings.appearance.theme) as ThemeMode
  const setAppearance = useSettingsStore((s) => s.setAppearance)
  const initialized = useRef(false)

  const storeSetTheme = useCallback((t: ThemeMode) => {
    setAppearance({ theme: t })
  }, [setAppearance])

  const toggleTheme = useCallback(() => {
    const idx = THEME_CYCLE.indexOf(theme)
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
    storeSetTheme(next)
  }, [theme, storeSetTheme])

  const setTheme = useCallback((t: ThemeMode) => {
    storeSetTheme(t)
  }, [storeSetTheme])

  /**
   * 应用 v2 主题
   */
  const applyTheme = useCallback((config: ThemeConfigV2 | ThemeConfigV1) => {
    applyThemeConfig(config, theme)
    persistThemeId(config.id)
  }, [theme])

  /**
   * 应用 Seed Token 直接定义（用户自定义时用）
   */
  const applySeed = useCallback((seed: Partial<SeedToken>) => {
    const resolvedMode = resolveMode(theme)
    const fullSeed: SeedToken = {
      accent: seed.accent ?? '#4338ca',
      bg: seed.bg ?? (resolvedMode === 'dark' ? '#0a0a0f' : '#ffffff'),
      fg: seed.fg ?? (resolvedMode === 'dark' ? '#e8e8e8' : '#1a1a1a'),
      radius: seed.radius ?? 8,
      fontBase: seed.fontBase ?? 16,
      spacingBase: seed.spacingBase ?? 8,
      mode: (resolvedMode === 'compact' ? 'light' : resolvedMode) as 'light' | 'dark',
    }
    const vars = deriveThemeVariables(fullSeed)
    clearThemeVariables()
    applyThemeToDOM(vars)
    document.documentElement.setAttribute('data-theme', resolvedMode)
  }, [theme])

  // 启动时：从 config 加载已保存的主题（统一存储源）
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const loadStartupTheme = async () => {
      try {
        // 优先从 config 读取（与主进程同步）
        const themeId = await window.electronAPI.invoke('config:get', { key: 'activeTheme' })
        if (themeId && typeof themeId === 'string') {
          await loadAndApplyThemeById(themeId, theme)
          persistThemeId(themeId)
          return
        }
      } catch { /* ignore */ }

      // fallback：从 localStorage 读取
      const localId = loadSavedThemeId()
      if (localId) {
        await loadAndApplyThemeById(localId, theme)
      } else {
        // 无保存主题，加载默认主题
        await loadAndApplyThemeById('default', theme)
        persistThemeId('default')
      }
    }
    loadStartupTheme()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // mode 变化时重新应用当前主题
  useEffect(() => {
    if (!initialized.current) return
    const savedId = loadSavedThemeId()
    if (savedId) {
      loadAndApplyThemeById(savedId, theme)
    } else {
      // 无保存主题，加载默认主题
      loadAndApplyThemeById('default', theme)
      persistThemeId('default')
    }

    // system 模式：监听系统主题变化
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => {
        const currentId = loadSavedThemeId() ?? 'default'
        loadAndApplyThemeById(currentId, theme)
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  // 监听主进程 theme:changed 事件（替代 MainLayout 中的旧监听）
  useEffect(() => {
    const unsub = window.electronAPI.on('theme:changed', (data: {
      themeId: string; mode?: string; colors?: Record<string, string>; themeData?: unknown
    }) => {
      if (data.themeData) {
        // v2 格式：完整主题数据
        applyThemeConfig(data.themeData as ThemeConfigV2, theme)
        persistThemeId(data.themeId)
      } else if (data.colors) {
        // v1 格式：仅颜色，构造临时配置
        const v1Config: ThemeConfigV1 = {
          id: data.themeId,
          name: '',
          author: '',
          description: '',
          mode: (data.mode as 'light' | 'dark') || 'light',
          colors: data.colors,
        }
        applyThemeConfig(v1Config, theme)
        persistThemeId(data.themeId)
      }
    })
    return unsub
  }, [theme])

  return {
    theme,
    setTheme,
    toggleTheme,
    applyTheme,
    applySeed,
    resolvedMode: resolveMode(theme),
  }
}
