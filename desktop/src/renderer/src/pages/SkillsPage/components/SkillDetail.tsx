/**
 * 技能详情侧滑面板
 * 展示技能的完整信息：描述、权限、标签、统计等
 */
import React, { useCallback, useEffect } from 'react'
import { SkillToggle } from './SkillToggle'
import type { SkillMeta, Permission } from '../../../stores/useSkillStore'
import {
  FileText, EditOne, Globe, SettingOne, Camera, Clipboard, Remind, FolderOpen
} from '../../../utils/statusMessages'

const permIcon = (p: string) =>
  React.createElement({ 'file.read': FileText, 'file.write': EditOne, 'network': Globe, 'exec': SettingOne, 'screen': Camera, 'clipboard': Clipboard, 'notification': Remind }[p] ?? SettingOne, { size: 16, fill: 'currentColor', theme: 'outline' })

interface SkillDetailProps {
  /** 技能元数据 */
  skill: SkillMeta
  /** 关闭面板 */
  onClose: () => void
  /** 切换激活状态 */
  onToggle: (id: string) => void
  /** 打开配置面板 */
  onConfig?: (id: string) => void
}

/** 权限图标映射 */
const PERMISSION_ICONS: Record<string, React.ReactNode> = {
  'file.read': permIcon('file.read'),
  'file.write': permIcon('file.write'),
  'network': permIcon('network'),
  'exec': permIcon('exec'),
  'screen': permIcon('screen'),
  'clipboard': permIcon('clipboard'),
  'notification': permIcon('notification'),
}

/** 权限名称映射 */
const PERMISSION_NAMES: Record<Permission, string> = {
  'file.read': '读取文件',
  'file.write': '写入文件',
  'network': '网络请求',
  'exec': '执行命令',
  'screen': '截屏录屏',
  'clipboard': '剪贴板',
  'notification': '系统通知'
}

/** 权限风险等级 */
const PERMISSION_RISK: Record<Permission, 'low' | 'medium' | 'high'> = {
  'file.read': 'low',
  'file.write': 'medium',
  'network': 'medium',
  'exec': 'high',
  'screen': 'high',
  'clipboard': 'low',
  'notification': 'low'
}

/** 安装来源名称 */
const SOURCE_NAMES: Record<string, string> = {
  'local': '本地',
  'market': '市场',
  'url': 'URL'
}

/** 格式化时间戳 */
function formatTime(timestamp?: number): string {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

export function SkillDetail({ skill, onClose, onToggle, onConfig }: SkillDetailProps) {
  /** 按 ESC 关闭 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  /** 阻止背景滚动 */
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose]
  )

  const handleToggle = useCallback(() => {
    onToggle(skill.id)
  }, [skill.id, onToggle])

  const handleConfig = useCallback(() => {
    onConfig?.(skill.id)
  }, [skill.id, onConfig])

  return (
    <div className='skill-detail-overlay' onClick={handleOverlayClick} role='dialog' aria-modal='true' aria-label={`${skill.name} 详情`}>
      <div className='skill-detail-panel'>
        {/* 头部 */}
        <div className='skill-detail-header'>
          <div className='skill-detail-header-left'>
            <div className='skill-detail-icon' aria-hidden='true'>
              {skill.icon ?? React.createElement(FolderOpen, { size: 16, fill: 'currentColor', theme: 'outline' })}
            </div>
            <div className='skill-detail-title-group'>
              <h2 className='skill-detail-name'>{skill.name}</h2>
              <span className='skill-detail-version'>v{skill.version} · {skill.author}</span>
            </div>
          </div>
          <button className='skill-detail-close' onClick={onClose} aria-label='关闭详情'>
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className='skill-detail-body'>
          {/* 描述 */}
          {skill.description && (
            <div className='skill-detail-section'>
              <h3 className='skill-detail-section-title'>描述</h3>
              <p className='skill-detail-section-content'>{skill.description}</p>
            </div>
          )}

          {/* 标签 */}
          {skill.tags.length > 0 && (
            <div className='skill-detail-section'>
              <h3 className='skill-detail-section-title'>标签</h3>
              <div className='skill-detail-tags'>
                {skill.tags.map((tag) => (
                  <span key={tag} className='skill-detail-tag'>{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* 权限 */}
          {skill.permissions.length > 0 && (
            <div className='skill-detail-section'>
              <h3 className='skill-detail-section-title'>所需权限</h3>
              <div className='skill-detail-permissions'>
                {skill.permissions.map((perm) => (
                  <div key={perm} className='skill-detail-permission'>
                    <span className='skill-detail-permission-icon' aria-hidden='true'>
                      {PERMISSION_ICONS[perm]}
                    </span>
                    <span className='skill-detail-permission-name'>
                      {PERMISSION_NAMES[perm]}
                    </span>
                    <span className={`skill-detail-permission-risk ${PERMISSION_RISK[perm]}`}>
                      {PERMISSION_RISK[perm] === 'low' ? '低' : PERMISSION_RISK[perm] === 'medium' ? '中' : '高'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 详细信息 */}
          <div className='skill-detail-section'>
            <h3 className='skill-detail-section-title'>详细信息</h3>
            <div className='skill-detail-meta'>
              <div className='skill-detail-meta-row'>
                <span className='skill-detail-meta-label'>安装来源</span>
                <span className='skill-detail-meta-value'>{SOURCE_NAMES[skill.installSource] ?? skill.installSource}</span>
              </div>
              <div className='skill-detail-meta-row'>
                <span className='skill-detail-meta-label'>安装时间</span>
                <span className='skill-detail-meta-value'>{formatTime(skill.installedAt)}</span>
              </div>
              <div className='skill-detail-meta-row'>
                <span className='skill-detail-meta-label'>使用次数</span>
                <span className='skill-detail-meta-value'>{skill.useCount}</span>
              </div>
              {skill.lastUsedAt && (
                <div className='skill-detail-meta-row'>
                  <span className='skill-detail-meta-label'>最后使用</span>
                  <span className='skill-detail-meta-value'>{formatTime(skill.lastUsedAt)}</span>
                </div>
              )}
              {skill.avgDuration !== undefined && skill.avgDuration > 0 && (
                <div className='skill-detail-meta-row'>
                  <span className='skill-detail-meta-label'>平均耗时</span>
                  <span className='skill-detail-meta-value'>{Math.round(skill.avgDuration)}ms</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className='skill-detail-footer'>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {onConfig && (
              <button
                className='btn-config'
                onClick={handleConfig}
                title='参数配置'
                aria-label={`${skill.name} 参数配置`}
                style={{ fontSize: '20px', width: '36px', height: '36px' }}
              >
                {React.createElement(SettingOne, { size: 16, fill: 'currentColor', theme: 'outline' })}
              </button>
            )}
            <span className='skill-detail-toggle-label'>
              {skill.active ? '技能已激活' : '技能已停用'}
            </span>
          </div>
          <SkillToggle active={skill.active} onChange={handleToggle} />
        </div>
      </div>
    </div>
  )
}
