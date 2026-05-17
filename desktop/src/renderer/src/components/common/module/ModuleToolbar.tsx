import React from 'react'

export interface ModuleToolbarProps {
  /** 搜索框值 */
  search?: string
  /** 搜索框变化回调 */
  onSearchChange?: (value: string) => void
  /** 搜索框占位符 */
  searchPlaceholder?: string
  /** 工具栏左侧内容 */
  children?: React.ReactNode
  /** 工具栏右侧内容 */
  extra?: React.ReactNode
}

/**
 * 模块公共工具栏组件
 * 搜索框 + 筛选按钮 + 额外操作
 */
export function ModuleToolbar({ search, onSearchChange, searchPlaceholder = '搜索...', children, extra }: ModuleToolbarProps) {
  return (
    <div className="mod-toolbar">
      <div className="mod-toolbar-left">
        {onSearchChange && (
          <input
            value={search ?? ''}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="mod-search"
          />
        )}
        {children}
      </div>
      {extra && <div className="mod-toolbar-right">{extra}</div>}
    </div>
  )
}

/** 筛选按钮组 */
export interface FilterOption {
  key: string
  label: string
  icon?: string
}

export function FilterButtons({ options, active, onChange }: { options: FilterOption[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="mod-filters">
      {options.map(opt => (
        <button
          key={opt.key}
          className={`mod-filter-btn ${active === opt.key ? 'active' : ''}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.icon && <span className="mod-filter-icon">{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  )
}
