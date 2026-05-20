/**
 * 主题切换组件 - Segmented 滑动样式
 * 支持 light / dark / system / compact 四种模式
 */
import React, { useRef, useEffect, useState } from 'react'
import type { ThemeMode } from '../../types/settings'
import { THEME_ICONS } from '../common/IconMap'

interface ThemeSwitcherProps {
  /** 当前主题 */
  readonly theme: ThemeMode
  /** 主题变更回调 */
  readonly onChange: (theme: ThemeMode) => void
}

/** 主题选项配置 */
const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
  { value: 'light', label: '浅色', icon: THEME_ICONS.light },
  { value: 'dark', label: '深色', icon: THEME_ICONS.dark },
  { value: 'system', label: '系统', icon: THEME_ICONS.system },
  { value: 'compact', label: '紧凑', icon: THEME_ICONS.compact },
]

export function ThemeSwitcher({ theme, onChange }: ThemeSwitcherProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const activeIdx = THEME_OPTIONS.findIndex((o) => o.value === theme)
    const btn = container.children[activeIdx] as HTMLElement | undefined
    if (!btn) return
    const containerRect = container.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    setSliderStyle({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    })
  }, [theme])

  return (
    <div className="theme-switcher" ref={containerRef}>
      <div
        className="theme-switcher-slider"
        style={{ left: sliderStyle.left, width: sliderStyle.width }}
      />
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`theme-switcher-option ${theme === opt.value ? 'theme-switcher-option--active' : ''}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={theme === opt.value}
        >
          <span className="theme-switcher-icon">{opt.icon}</span>
          <span className="theme-switcher-label">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}
