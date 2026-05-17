import React from 'react'

export interface ModuleTab {
  key: string
  label: string
  count?: number
}

export interface ModuleHeaderProps {
  /** 图标 emoji */
  icon: string
  /** 标题文字 */
  title: string
  /** 标签页列表 */
  tabs?: ModuleTab[]
  /** 当前激活的标签 */
  activeTab?: string
  /** 标签切换回调 */
  onTabChange?: (key: string) => void
  /** 右侧操作区 */
  actions?: React.ReactNode
}

/**
 * 模块公共头部组件
 * 统一的标题 + 标签切换 + 操作按钮布局
 */
export function ModuleHeader({ icon, title, tabs, activeTab, onTabChange, actions }: ModuleHeaderProps) {
  return (
    <div className="mod-header">
      <div className="mod-header-left">
        <span className="mod-header-icon">{icon}</span>
        <h1 className="mod-header-title">{title}</h1>
      </div>
      <div className="mod-header-right">
        {tabs && tabs.length > 0 && (
          <div className="mod-tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`mod-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => onTabChange?.(tab.key)}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="mod-tab-count">{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {actions && <div className="mod-header-actions">{actions}</div>}
      </div>
    </div>
  )
}
