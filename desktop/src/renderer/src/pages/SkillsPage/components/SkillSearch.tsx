/**
 * 技能搜索组件
 * 带图标的搜索输入框
 */
import React, { useCallback } from 'react'
import { Search } from '../../../utils/statusMessages'

interface SkillSearchProps {
  /** 搜索值 */
  value: string
  /** 值变化回调 */
  onChange: (value: string) => void
  /** 占位文本 */
  placeholder?: string
}

export function SkillSearch({ value, onChange, placeholder = '搜索技能' }: SkillSearchProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value)
    },
    [onChange]
  )

  return (
    <div className='skill-search'>
      <span className='skill-search-icon' aria-hidden='true'>{React.createElement(Search, { size: 16, fill: '#9ca3af', theme: 'outline' })}</span>
      <input
        className='skill-search-input'
        type='text'
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label='搜索技能'
      />
    </div>
  )
}
