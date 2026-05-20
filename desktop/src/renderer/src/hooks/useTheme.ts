/**
 * useTheme - 主题管理 Hook v2.0
 * 
 * 升级内容：
 * 1. 支持 mode + theme 解耦（布局模式 × 主题配色）
 * 2. 集成 themeEngine 自动派生
 * 3. 支持 v1/v2 格式主题 JSON
 * 4. 保留向后兼容
 */
import { useEffect, useCallback } from 'react'
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

  // 设置 data-theme 属性（向后兼容）
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
   * 应用 v2 主题（核心新功能）
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

  // 初始化 / mode 变化时重新应用主题
  useEffect(() => {
    const savedId = loadSavedThemeId()
    if (savedId) {
      loadAndApplyThemeById(savedId, theme)
    } else {
      const resolved = resolveMode(theme)
      document.documentElement.setAttribute('data-theme', resolved)
    }

    // system 模式监听系统主题变化
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => {
        const currentId = loadSavedThemeId()
        if (currentId) {
          loadAndApplyThemeById(currentId, theme)
        } else {
          document.documentElement.setAttribute('data-theme', getSystemPrefersDark() ? 'dark' : 'light')
        }
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
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
