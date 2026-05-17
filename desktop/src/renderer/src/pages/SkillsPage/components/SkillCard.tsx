/**
 * 技能卡片组件
 * 左图标 + 右文字（名称+描述）+ 底部标签、配置和开关
 */
import React, { useCallback } from 'react'
import { SkillToggle } from './SkillToggle'
import type { SkillMeta } from '../../../stores/useSkillStore'

interface SkillCardProps {
  /** 技能元数据 */
  skill: SkillMeta
  /** 切换激活状态 */
  onToggle: (id: string) => void
  /** 点击卡片（进入详情） */
  onClick: (id: string) => void
  /** 打开配置面板 */
  onConfig?: (id: string) => void
}

/** 默认图标映射 */
const TAG_ICONS: Record<string, string> = {
  '开发工具': '🛠️',
  '效率': '⚡',
  '生活服务': '🏠',
  'OPC一人公司': '🏢',
  'AI': '🤖',
  '数据': '📊',
  '安全': '🔒',
  '文档': '📄'
}

/** 根据标签获取图标 */
function getSkillIcon(skill: SkillMeta): string {
  if (skill.icon) return skill.icon
  for (const tag of skill.tags) {
    if (TAG_ICONS[tag]) return TAG_ICONS[tag]
  }
  return '📦'
}

export function SkillCard({ skill, onToggle, onClick, onConfig }: SkillCardProps) {
  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggle(skill.id)
    },
    [skill.id, onToggle]
  )

  const handleClick = useCallback(() => {
    onClick(skill.id)
  }, [skill.id, onClick])

  const handleConfig = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onConfig?.(skill.id)
    },
    [skill.id, onConfig]
  )

  const icon = getSkillIcon(skill)
  const displayTags = skill.tags.slice(0, 2)

  return (
    <div
      className='skill-card'
      onClick={handleClick}
      role='button'
      tabIndex={0}
      aria-label={`${skill.name} - ${skill.description}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <div className='skill-card-header'>
        <div className='skill-card-icon' aria-hidden='true'>
          {icon}
        </div>
        <div className='skill-card-info'>
          <div className='skill-card-name'>{skill.name}</div>
          <div className='skill-card-desc'>{skill.description}</div>
        </div>
      </div>
      <div className='skill-card-footer'>
        <div className='skill-card-tags'>
          {displayTags.map((tag) => (
            <span key={tag} className='skill-card-tag'>{tag}</span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {onConfig && (
            <button
              className='btn-config'
              onClick={handleConfig}
              title='配置'
              aria-label={`${skill.name} 配置`}
            >
              ⚙️
            </button>
          )}
          <div onClick={handleToggle}>
            <SkillToggle active={skill.active} onChange={() => onToggle(skill.id)} />
          </div>
        </div>
      </div>
    </div>
  )
}
