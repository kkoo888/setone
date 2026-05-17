/**
 * 技能分类标签栏
 * 横向滚动的标签组，支持选中态切换
 */
import React, { useCallback } from 'react'

interface SkillTagsProps {
  /** 标签列表 */
  tags: string[]
  /** 当前激活的标签 */
  active: string
  /** 标签切换回调 */
  onChange: (tag: string) => void
}

export function SkillTags({ tags, active, onChange }: SkillTagsProps) {
  const handleClick = useCallback(
    (tag: string) => {
      onChange(tag)
    },
    [onChange]
  )

  if (tags.length === 0) return null

  return (
    <div className='skill-tags' role='tablist' aria-label='技能分类'>
      {tags.map((tag) => (
        <button
          key={tag}
          className={`skill-tag${active === tag ? ' active' : ''}`}
          onClick={() => handleClick(tag)}
          role='tab'
          aria-selected={active === tag}
        >
          {tag}
        </button>
      ))}
    </div>
  )
}
