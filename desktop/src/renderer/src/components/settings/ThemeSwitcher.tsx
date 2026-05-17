/**
 * 主题切换组件
 * 支持 light / dark / system 三种模式
 */
import React from 'react'
import type { ThemeMode } from '../../types/settings'

interface ThemeSwitcherProps {
  /** 当前主题 */
  readonly theme: ThemeMode
  /** 主题变更回调 */
  readonly onChange: (theme: ThemeMode) => void
}

/** 主题选项配置 */
const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string; icon: string }> = [
  { value: 'light', label: '浅色', icon: '☀️' },
  { value: 'dark', label: '深色', icon: '🌙' },
  { value: 'system', label: '跟随系统', icon: '💻' },
]

export function ThemeSwitcher({ theme, onChange }: ThemeSwitcherProps) {
  return (
    <div className="theme-switcher">
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`theme-option ${theme === opt.value ? 'theme-option-active' : ''}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={theme === opt.value}
        >
          <span className="theme-option-icon">{opt.icon}</span>
          <span className="theme-option-label">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}
