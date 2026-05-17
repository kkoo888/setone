/**
 * 通用开关（Toggle）组件
 * 支持标签、禁用状态、自定义样式
 */
import React from 'react'

interface ToggleProps {
  /** 当前值 */
  readonly checked: boolean
  /** 值变更回调 */
  readonly onChange: (checked: boolean) => void
  /** 标签文本 */
  readonly label?: string
  /** 是否禁用 */
  readonly disabled?: boolean
  /** 尺寸 */
  readonly size?: 'sm' | 'md'
  /** 附加类名 */
  readonly className?: string
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
  className = '',
}: ToggleProps) {
  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked)
    }
  }

  return (
    <label
      className={`toggle-wrapper toggle-${size} ${disabled ? 'toggle-disabled' : ''} ${className}`}
      onClick={(e) => e.preventDefault()}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`toggle-track ${checked ? 'toggle-on' : 'toggle-off'}`}
        onClick={handleToggle}
      >
        <span className="toggle-thumb" />
      </button>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  )
}
