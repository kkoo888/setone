/**
 * 模块卡片组件
 * 列表式布局：左侧图标 + 中间名称描述状态 + 右侧开关
 */
import React, { useMemo } from 'react'
import { FolderOpen } from '../../../utils/statusMessages'
import type { ModuleInfo, ModuleStatus } from '../../../stores/useModulesStore'

const folderI = React.createElement(FolderOpen, { size: 16, fill: 'currentColor', theme: 'outline' })

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

/** 状态显示配置 */
const STATUS_CONFIG: Record<ModuleStatus, { label: string; className: string }> = {
  active: { label: '运行中', className: 'mod-status-badge--active' },
  disabled: { label: '已停止', className: 'mod-status-badge--disabled' },
  loading: { label: '加载中', className: 'mod-status-badge--loading' },
  error: { label: '异常', className: 'mod-status-badge--error' },
  discovered: { label: '已发现', className: 'mod-status-badge--discovered' },
}

export function ModuleCard({ module, selected, onSelect, onToggle }: ModuleCardProps) {
  const status = module.status ?? (module.enabled ? 'active' : 'disabled')
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.disabled

  /** 显示的能力标签（最多3个） */
  const visibleCaps = useMemo(() => {
    const caps = module.capabilities ?? []
    return caps.slice(0, 3)
  }, [module.capabilities])

  const extraCapCount = (module.capabilities?.length ?? 0) - visibleCaps.length

  return (
    <div
      className={`mod-card${selected ? ' mod-card--selected' : ''}${status === 'error' ? ' mod-card--error' : ''}`}
      onClick={() => onSelect(module.id)}
      role='button'
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(module.id)
      }}
    >
      {/* 左侧图标 */}
      <div className='mod-card-icon'>
        <span>{module.icon ?? folderI}</span>
      </div>

      {/* 中间信息 */}
      <div className='mod-card-body'>
        <div className='mod-card-top'>
          <span className='mod-card-name'>{module.name}</span>
          <span className='mod-card-version'>v{module.version}</span>
        </div>
        <span className='mod-card-desc'>{module.description ?? '暂无描述'}</span>
        {visibleCaps.length > 0 && (
          <div className='mod-card-meta'>
            {visibleCaps.map((cap) => (
              <span key={cap} className='mod-card-cap-tag'>
                {cap}
              </span>
            ))}
            {extraCapCount > 0 && (
              <span className='mod-card-cap-more'>+{extraCapCount}</span>
            )}
          </div>
        )}
      </div>

      {/* 状态标签 */}
      <span className={`mod-status-badge ${statusConfig.className}`}>
        <span className={`mod-status-dot${status === 'loading' ? ' mod-status-dot--loading' : ''}`} />
        {statusConfig.label}
      </span>

      {/* 开关 */}
      <label
        className='mod-switch'
        onClick={(e) => e.stopPropagation()}
        aria-label={`${module.enabled ? '禁用' : '启用'} ${module.name}`}
      >
        <input
          type='checkbox'
          checked={module.enabled}
          onChange={() => onToggle(module.id)}
        />
        <span className='mod-switch-track'>
          <span className='mod-switch-thumb' />
        </span>
      </label>
    </div>
  )
}
