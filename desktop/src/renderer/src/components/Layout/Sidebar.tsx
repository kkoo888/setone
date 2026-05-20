import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useAppStore, type PanelId } from '../../stores/useAppStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useModulesStore } from '../../stores/useModulesStore'
import { SIDEBAR_ICONS } from '../common/IconMap'

/** 固定面板项（始终显示） */
const FIXED_PANELS: Array<{ id: PanelId; icon: React.ReactNode; label: string }> = [
  { id: 'chat', icon: SIDEBAR_ICONS.chat, label: '对话' },
  { id: 'skills', icon: SIDEBAR_ICONS.skills, label: '技能' },
]

/** 模块关联的面板项（随模块启停动态显示/隐藏） */
const MODULE_PANELS: Array<{ id: PanelId; icon: React.ReactNode; label: string; moduleId: string }> = [
  { id: 'workflow', icon: SIDEBAR_ICONS.workflow, label: '工作流', moduleId: 'workflow' },
  { id: 'knowledge-base', icon: SIDEBAR_ICONS['knowledge-base'], label: '知识库', moduleId: 'knowledge-base' },
  { id: 'translator', icon: SIDEBAR_ICONS.translator, label: '翻译', moduleId: 'translator' },
  { id: 'shortcuts', icon: SIDEBAR_ICONS.shortcuts, label: '快捷指令', moduleId: 'input' },
  { id: 'clipboard-history', icon: SIDEBAR_ICONS['clipboard-history'], label: '剪贴板', moduleId: 'clipboard-history' },
  { id: 'notifications', icon: SIDEBAR_ICONS.notifications, label: '通知', moduleId: 'desktop' },
  { id: 'multi-session', icon: SIDEBAR_ICONS['multi-session'], label: '多会话', moduleId: 'multi-session' },
  { id: 'calendar', icon: SIDEBAR_ICONS.calendar, label: '日程', moduleId: 'calendar' },
  { id: 'quick-preview', icon: SIDEBAR_ICONS['quick-preview'], label: '预览', moduleId: 'quick-preview' },
  { id: 'system-dashboard', icon: SIDEBAR_ICONS['system-dashboard'], label: '仪表盘', moduleId: 'system-dashboard' },
  { id: 'theme-store', icon: SIDEBAR_ICONS['theme-store'], label: '主题', moduleId: 'theme-store' },
  { id: 'code-snippets', icon: SIDEBAR_ICONS['code-snippets'], label: '代码片段', moduleId: 'code-snippets' },
]

/** 底部固定面板项 */
const BOTTOM_PANELS: Array<{ id: PanelId; icon: React.ReactNode; label: string }> = [
  { id: 'modules', icon: SIDEBAR_ICONS.modules, label: '模块' },
  { id: 'settings', icon: SIDEBAR_ICONS.settings, label: '设置' },
  { id: 'live2d', icon: SIDEBAR_ICONS.live2d, label: 'Live2D' },
  { id: 'live2d5', icon: SIDEBAR_ICONS.live2d5, label: 'Live2D-5' },
]

export function Sidebar() {
  const activePanel = useAppStore((s) => s.activePanel)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const avatar = useSettingsStore((s) => s.settings.avatar)
  const modules = useModulesStore((s) => s.modules)
  const [collapsed, setCollapsed] = useState(false)
  const toggleCollapse = useCallback(() => setCollapsed((prev) => !prev), [])

  // 首次加载模块列表
  useEffect(() => {
    if (modules.length === 0) {
      window.electronAPI
        .invoke('module:list')
        .then((list: unknown[]) => {
          if (Array.isArray(list)) {
            useModulesStore.getState().setModules(
              list.map((m: Record<string, unknown>) => ({
                ...m,
                status: m.status ?? (m.enabled ? 'active' : 'disabled'),
              }))
            )
          }
        })
        .catch(console.error)
    }
  }, [modules.length])

  /** 构建已启用模块ID集合 */
  const enabledModuleIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of modules) {
      if (m.enabled && m.status !== 'disabled' && m.status !== 'error') {
        ids.add(m.id)
      }
    }
    return ids
  }, [modules])

  /** 过滤出已启用模块的面板 */
  const visibleModulePanels = useMemo(
    () => MODULE_PANELS.filter((p) => enabledModuleIds.has(p.moduleId)),
    [enabledModuleIds]
  )

  /** 当前激活的模块面板如果模块被禁用，自动切回 chat */
  useEffect(() => {
    const modulePanel = MODULE_PANELS.find((p) => p.id === activePanel)
    if (modulePanel && !enabledModuleIds.has(modulePanel.moduleId)) {
      setActivePanel('chat')
    }
  }, [activePanel, enabledModuleIds, setActivePanel])

  return (
    <nav className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`} aria-label="主导航">
      {/* 顶部固定区域：logo + 对话 */}
      <div className="sidebar-top">
        <div className="sidebar-logo" aria-hidden="true">
          {avatar ? (
            <img src={avatar} alt="" className="sidebar-logo-avatar" />
          ) : (
            <span className="sidebar-icon">{SIDEBAR_ICONS.chat}</span>
          )}
        </div>
        <ul className="sidebar-nav">
          {FIXED_PANELS.map((p) => (
            <li key={p.id}>
              <button
                className={`sidebar-item ${activePanel === p.id ? 'active' : ''}`}
                onClick={() => setActivePanel(p.id)}
                title={p.label}
                aria-current={activePanel === p.id ? 'page' : undefined}
              >
                <span className="sidebar-icon">{p.icon}</span>
                {!collapsed && <span className="sidebar-label">{p.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* 中间滚动区域：模块面板 */}
      {visibleModulePanels.length > 0 && (
        <div className="sidebar-middle">
          <div className="sidebar-divider" aria-hidden="true">
            <hr className="sidebar-divider-line" />
          </div>
          <ul className="sidebar-nav sidebar-nav--scrollable">
            {visibleModulePanels.map((p) => (
              <li key={p.id}>
                <button
                  className={`sidebar-item sidebar-item--module ${activePanel === p.id ? 'active' : ''}`}
                  onClick={() => setActivePanel(p.id)}
                  title={p.label}
                  aria-current={activePanel === p.id ? 'page' : undefined}
                >
                  <span className="sidebar-icon">{p.icon}</span>
                  {!collapsed && <span className="sidebar-label">{p.label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 底部固定区域：模块/设置/Live2D + 折叠按钮 */}
      <div className="sidebar-bottom">
        <ul className="sidebar-nav">
          {BOTTOM_PANELS.map((p) => (
            <li key={p.id}>
              <button
                className={`sidebar-item ${activePanel === p.id ? 'active' : ''}`}
                onClick={() => setActivePanel(p.id)}
                title={p.label}
                aria-current={activePanel === p.id ? 'page' : undefined}
              >
                <span className="sidebar-icon">{p.icon}</span>
                {!collapsed && <span className="sidebar-label">{p.label}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <button
            className="sidebar-toggle"
            onClick={toggleCollapse}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-expanded={!collapsed}
          >
            <span className="sidebar-toggle-icon">{collapsed ? '›' : '‹'}</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
