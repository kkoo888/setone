/**
 * 通用滑块（Slider）组件
 * 支持最小/最大值、步长、显示当前值
 */
import React, { useCallback } from 'react'

interface SliderProps {
  /** 当前值 */
  readonly value: number
  /** 值变更回调 */
  readonly onChange: (value: number) => void
  /** 最小值 */
  readonly min: number
  /** 最大值 */
  readonly max: number
  /** 步长 */
  readonly step?: number
  /** 标签文本 */
  readonly label?: string
  /** 是否显示当前值 */
  readonly showValue?: boolean
  /** 值的格式化函数 */
  readonly formatValue?: (value: number) => string
  /** 是否禁用 */
  readonly disabled?: boolean
  /** 附加类名 */
  readonly className?: string
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  showValue = true,
  formatValue,
  disabled = false,
  className = '',
}: SliderProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value))
    },
    [onChange]
  )

  const displayValue = formatValue ? formatValue(value) : String(value)

  return (
    <div className={`slider-wrapper ${disabled ? 'slider-disabled' : ''} ${className}`}>
      {(label || showValue) && (
        <div className="slider-header">
          {label && <span className="slider-label">{label}</span>}
          {showValue && <span className="slider-value">{displayValue}</span>}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="slider-input"
      />
    </div>
  )
}
