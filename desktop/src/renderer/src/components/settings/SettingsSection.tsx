/**
 * 设置区块容器组件
 * 用于分组展示设置项，支持标题、描述、图标
 */
import React from 'react'

interface SettingsSectionProps {
  /** 区块标题 */
  readonly title: string
  /** 区块描述 */
  readonly description?: string
  /** 图标（emoji 或文字） */
  readonly icon?: string
  /** 子元素 */
  readonly children: React.ReactNode
  /** 附加类名 */
  readonly className?: string
}

export function SettingsSection({
  title,
  description,
  icon,
  children,
  className = '',
}: SettingsSectionProps) {
  return (
    <section className={`settings-section ${className}`}>
      <div className="settings-section-header">
        {icon && <span className="settings-section-icon">{icon}</span>}
        <div className="settings-section-title-group">
          <h3 className="settings-section-title">{title}</h3>
          {description && (
            <p className="settings-section-desc">{description}</p>
          )}
        </div>
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  )
}
