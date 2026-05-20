import { useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/useAppStore'
import type { ThemeMode } from '../types/settings'

const STORAGE_KEY = 'app-theme'
const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system', 'compact']

function loadSavedTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system' || saved === 'compact') return saved
  } catch { /* ignore */ }
  return 'system'
}

function persistTheme(theme: ThemeMode): void {
  try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
}

function getSystemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveTheme(theme: ThemeMode): 'light' | 'dark' | 'compact' {
  if (theme === 'system') return getSystemPrefersDark() ? 'dark' : 'light'
  if (theme === 'compact') return 'compact'
  return theme
}

export function useTheme() {
  const theme = useAppStore((s) => s.theme) as ThemeMode
  const storeSetTheme = useAppStore((s) => s.setTheme)

  useEffect(() => {
    const saved = loadSavedTheme()
    if (saved !== theme) storeSetTheme(saved)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = useCallback(() => {
    const idx = THEME_CYCLE.indexOf(theme)
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
    storeSetTheme(next)
    persistTheme(next)
  }, [theme, storeSetTheme])

  const setTheme = useCallback((t: ThemeMode) => {
    storeSetTheme(t)
    persistTheme(t)
  }, [storeSetTheme])

  useEffect(() => {
    const root = document.documentElement
    const resolved = resolveTheme(theme)
    root.setAttribute('data-theme', resolved)

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => root.setAttribute('data-theme', getSystemPrefersDark() ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  return { theme, setTheme, toggleTheme }
}
