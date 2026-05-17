import React from 'react'
import { useTheme } from '../../hooks/useTheme'
import { useAppStore } from '../../stores/useAppStore'

const panelTitles: Record<string, string> = { chat: '智能对话', settings: '设置', modules: '模块管理' }

export function Header() {
  const activePanel = useAppStore((s) => s.activePanel)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const showChangesPanel = useAppStore((s) => s.showChangesPanel)
  const setShowChangesPanel = useAppStore((s) => s.setShowChangesPanel)
  const { theme, setTheme } = useTheme()
  return (
    <header className="header">
      <h1 className="header-title">{panelTitles[activePanel ?? 'chat'] ?? '智能助手'}</h1>
      <div className="header-actions">
        <select className="theme-select" value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')} aria-label="主题切换">
          <option value="system">跟随系统</option>
          <option value="light">亮色</option>
          <option value="dark">暗色</option>
        </select>
        <button
          className="header-changes-btn"
          onClick={() => setShowChangesPanel(!showChangesPanel)}
          title="变更面板"
          aria-label="变更面板"
          aria-pressed={showChangesPanel}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button className="header-settings-btn" onClick={() => setActivePanel('settings')} title="打开设置" aria-label="打开设置">⚙️</button>
      </div>
    </header>
  )
}
