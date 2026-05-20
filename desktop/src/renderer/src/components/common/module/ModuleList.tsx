import React from 'react'
import { EMPTY_ICONS } from '../IconMap'

/** 模块内容列表容器 */
export function ModuleList({ children, emptyText = '暂无数据', emptyIcon }: {
  children: React.ReactNode
  emptyText?: string
  emptyIcon?: React.ReactNode
}) {
  const childArray = React.Children.toArray(children)
  if (childArray.length === 0) {
    return (
      <div className="mod-empty">
        <span className="mod-empty-icon">{emptyIcon ?? EMPTY_ICONS.default}</span>
        <span>{emptyText}</span>
      </div>
    )
  }
  return <div className="mod-list">{children}</div>
}

/** 模块列表项 */
export interface ModuleListItemProps {
  /** 唯一标识 */
  id: string
  /** 点击回调 */
  onClick?: () => void
  /** 左侧图标 */
  icon?: React.ReactNode
  /** 标题 */
  title: React.ReactNode
  /** 副标题/描述 */
  subtitle?: React.ReactNode
  /** 标签 */
  badge?: React.ReactNode
  /** 右侧操作按钮 */
  actions?: React.ReactNode
  /** 底部附加内容 */
  extra?: React.ReactNode
  /** 是否高亮 */
  highlight?: boolean
  /** 自定义类名 */
  className?: string
}

export function ModuleListItem({ id, onClick, icon, title, subtitle, badge, actions, extra, highlight, className }: ModuleListItemProps) {
  return (
    <div
      key={id}
      className={`mod-item${highlight ? ' mod-item--highlight' : ''}${onClick ? ' mod-item--clickable' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
    >
      <div className="mod-item-main">
        {icon && <div className="mod-item-icon">{icon}</div>}
        <div className="mod-item-content">
          <div className="mod-item-header">
            <span className="mod-item-title">{title}</span>
            {badge}
          </div>
          {subtitle && <div className="mod-item-subtitle">{subtitle}</div>}
        </div>
        {actions && <div className="mod-item-actions">{actions}</div>}
      </div>
      {extra && <div className="mod-item-extra">{extra}</div>}
    </div>
  )
}

/** 模块弹窗/详情面板 */
export function ModuleModal({ title, onClose, children, footer }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="mod-modal-overlay" onClick={onClose}>
      <div className="mod-modal" onClick={e => e.stopPropagation()}>
        <div className="mod-modal-header">
          <h3 className="mod-modal-title">{title}</h3>
          <button className="mod-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mod-modal-body">{children}</div>
        {footer && <div className="mod-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
