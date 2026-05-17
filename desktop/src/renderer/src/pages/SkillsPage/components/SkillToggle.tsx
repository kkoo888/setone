/**
 * 技能开关组件
 * 胶囊形切换开关，关闭态灰色，开启态蓝紫色
 */
import React, { useCallback } from 'react'

interface SkillToggleProps {
  /** 当前是否激活 */
  active: boolean
  /** 切换回调 */
  onChange: (active: boolean) => void
  /** 是否禁用 */
  disabled?: boolean
}

export function SkillToggle({ active, onChange, disabled = false }: SkillToggleProps) {
  const handleChange = useCallback(() => {
    if (!disabled) {
      onChange(!active)
    }
  }, [active, disabled, onChange])

  return (
    <label className={`skill-toggle${disabled ? ' skill-toggle--disabled' : ''}`}>
      <input
        type='checkbox'
        checked={active}
        onChange={handleChange}
        disabled={disabled}
        aria-label={active ? '点击停用' : '点击激活'}
      />
      <span className='skill-toggle-track'>
        <span className='skill-toggle-thumb' />
      </span>
    </label>
  )
}
