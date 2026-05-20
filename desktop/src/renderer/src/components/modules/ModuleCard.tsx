/**
 * 模块卡片组件
 * 列表式布局：左侧图标 + 中间名称描述 + 右侧开关
 * 参考"生活小工具"风格设计
 */
import React from 'react'
import { FolderOpen } from '@icon-park/react'
import type { ModuleInfo } from '../../stores/useModulesStore'

interface ModuleCardProps {
  /** 模块信息 */
  readonly module: ModuleInfo
  /** 是否被选中 */
  readonly selected: boolean
  /** 点击选中回调 */
  readonly onSelect: (id: string) => void
  /** 启停切换回调 */
  readonly onToggle: (id: string) => void
}

export function ModuleCard({ module, selected, onSelect, onToggle }: ModuleCardProps) {
  return (
    <div
      className={`mc-card ${selected ? 'mc-card--selected' : ''}`}
      onClick={() => onSelect(module.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(module.id)
      }}
    >
      {/* 左侧图标 */}
      <div className="mc-icon-wrap">
        <span className="mc-icon">{module.icon ?? React.createElement(FolderOpen, { size: 16, fill: 'currentColor', theme: 'outline' })}</span>
      </div>

      {/* 中间名称 + 描述 */}
      <div className="mc-body">
        <span className="mc-name">{module.name}</span>
        <span className="mc-desc">{module.description ?? '暂无描述'}</span>
      </div>

      {/* 右侧开关 */}
      <label
        className="mc-switch"
        onClick={(e) => e.stopPropagation()}
        aria-label={`${module.enabled ? '禁用' : '启用'} ${module.name}`}
      >
        <input
          type="checkbox"
          checked={module.enabled}
          onChange={() => onToggle(module.id)}
        />
        <span className="mc-switch-track">
          <span className="mc-switch-thumb" />
        </span>
      </label>
    </div>
  )
}
