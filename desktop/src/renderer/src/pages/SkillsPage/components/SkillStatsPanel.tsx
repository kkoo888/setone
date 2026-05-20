/**
 * 技能使用统计面板
 * 侧滑弹窗，展示技能的使用次数、成功率、平均耗时等统计数据
 */
import React, { useEffect, useCallback, useState, useMemo } from 'react'
import { FolderOpen, ChartHistogram, LoadingFour, Inbox, CheckOne, CloseOne } from '@icon-park/react'
import { useSkillStore } from '../../../stores/useSkillStore'

interface SkillStatsPanelProps {
  onClose: () => void
}

/** 格式化时间戳 */
function formatTime(timestamp: number | null): string {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

/** 格式化耗时 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}min`
}

/** 统计数据类型 */
interface SkillStatsData {
  skillId: string
  totalCalls: number
  successCount: number
  failureCount: number
  lastUsedAt: number | null
  avgDuration: number
  recentRecords: Array<{
    skillId: string
    timestamp: number
    duration: number
    success: boolean
    errorMessage?: string
  }>
}

export default function SkillStatsPanel({ onClose }: SkillStatsPanelProps) {
  const { skills, loadStats } = useSkillStore()
  const statsList = useSkillStore((s) => s.statsList)
  const statsLoading = useSkillStore((s) => s.statsLoading)

  const [expandedId, setExpandedId] = useState<string | null>(null)

  /** 加载统计数据 */
  useEffect(() => {
    loadStats()
  }, [loadStats])

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

  /** 点击遮罩关闭 */
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose]
  )

  /** 概览统计 */
  const overview = useMemo(() => {
    if (!statsList || statsList.length === 0) {
      return { totalCalls: 0, successRate: 0, avgDuration: 0, activeSkillCount: 0 }
    }
    const totalCalls = statsList.reduce((sum, s) => sum + s.totalCalls, 0)
    const totalSuccess = statsList.reduce((sum, s) => sum + s.successCount, 0)
    const totalDuration = statsList.reduce((sum, s) => sum + s.avgDuration * s.totalCalls, 0)
    return {
      totalCalls,
      successRate: totalCalls > 0 ? Math.round((totalSuccess / totalCalls) * 100) : 0,
      avgDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
      activeSkillCount: statsList.length
    }
  }, [statsList])

  /** 获取技能名称 */
  const getSkillName = useCallback((skillId: string): string => {
    return skills.find((s) => s.id === skillId)?.name ?? skillId
  }, [skills])

  /** 获取技能图标 */
  const getSkillIcon = useCallback((skillId: string): React.ReactNode => {
    return skills.find((s) => s.id === skillId)?.icon ?? React.createElement(FolderOpen, { size: 16, fill: 'currentColor', theme: 'outline' })
  }, [skills])

  return (
    <div className='skill-config-overlay' onClick={handleOverlayClick} role='dialog' aria-modal='true' aria-label='使用统计面板'>
      <div className='skill-config-panel chain-panel'>
        {/* 头部 */}
        <div className='skill-config-header'>
          <div className='skill-config-header-left'>
            <span className='skill-config-icon' aria-hidden='true'>{React.createElement(ChartHistogram, { size: 24, fill: '#9ca3af', theme: 'outline' })}</span>
            <div>
              <h2 className='skill-config-title'>使用统计</h2>
              <span className='skill-config-subtitle'>技能使用情况分析</span>
            </div>
          </div>
          <button className='skill-config-close' onClick={onClose} aria-label='关闭'>
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className='skill-config-body'>
          {statsLoading ? (
            <div className='skill-config-empty'>
              <span>{React.createElement(LoadingFour, { size: 16, fill: 'currentColor', theme: 'outline' })}</span>
              <span>加载统计数据...</span>
            </div>
          ) : (
            <>
              {/* 概览卡片 */}
              <div className='stats-grid'>
                <div className='stats-card'>
                  <div className='stats-number'>{overview.totalCalls}</div>
                  <div className='stats-label'>总调用次数</div>
                </div>
                <div className='stats-card'>
                  <div className='stats-number success'>{overview.successRate}%</div>
                  <div className='stats-label'>成功率</div>
                </div>
                <div className='stats-card'>
                  <div className='stats-number warning'>{formatDuration(overview.avgDuration)}</div>
                  <div className='stats-label'>平均耗时</div>
                </div>
                <div className='stats-card'>
                  <div className='stats-number accent'>{overview.activeSkillCount}</div>
                  <div className='stats-label'>使用过的技能</div>
                </div>
              </div>

              {/* 技能排行 */}
              {!statsList || statsList.length === 0 ? (
                <div className='skill-config-empty'>
                  <span>{React.createElement(Inbox, { size: 16, fill: '#9ca3af', theme: 'outline' })}</span>
                  <span>暂无使用记录</span>
                </div>
              ) : (
                <div className='stats-rank-list'>
                  <div className='stats-rank-header'>技能排行（按使用次数）</div>
                  {statsList.map((stat, index) => {
                    const isExpanded = expandedId === stat.skillId
                    const successRate = stat.totalCalls > 0
                      ? Math.round((stat.successCount / stat.totalCalls) * 100)
                      : 0

                    return (
                      <div key={stat.skillId}>
                        {/* 技能行 */}
                        <div
                          className='stats-rank-item'
                          onClick={() => setExpandedId(isExpanded ? null : stat.skillId)}
                        >
                          <span className={`stats-rank-badge ${index < 3 ? 'top' : ''}`}>
                            {index + 1}
                          </span>
                          <span className='stats-rank-icon'>{getSkillIcon(stat.skillId)}</span>
                          <div className='stats-rank-name'>
                            {getSkillName(stat.skillId)}
                          </div>
                          <div className='stats-rank-meta'>
                            <span>{stat.totalCalls} 次</span>
                            <span className={`stats-rank-rate ${successRate >= 80 ? 'success' : successRate >= 50 ? 'warning' : 'error'}`}>
                              {successRate}%
                            </span>
                          </div>
                          <span className={`stats-rank-arrow ${isExpanded ? 'expanded' : ''}`}>→</span>
                        </div>

                        {/* 展开详情 */}
                        {isExpanded && (
                          <div className='stats-detail'>
                            <div className='stats-detail-grid'>
                              <div className='stats-detail-item'>
                                <div className='stats-detail-number'>{stat.totalCalls}</div>
                                <div className='stats-detail-label'>总调用</div>
                              </div>
                              <div className='stats-detail-item'>
                                <div className='stats-detail-number success'>{stat.successCount}</div>
                                <div className='stats-detail-label'>成功</div>
                              </div>
                              <div className='stats-detail-item'>
                                <div className='stats-detail-number error'>{stat.failureCount}</div>
                                <div className='stats-detail-label'>失败</div>
                              </div>
                            </div>

                            <div className='stats-label' style={{ marginBottom: 'var(--spacing-sm)' }}>
                              平均耗时: {formatDuration(stat.avgDuration)} · 最后使用: {formatTime(stat.lastUsedAt)}
                            </div>

                            {stat.recentRecords.length > 0 && (
                              <>
                                <div className='stats-records-title'>最近记录</div>
                                <div className='stats-records-list'>
                                  {stat.recentRecords.map((record, i) => (
                                    <div key={i} className='stats-record-row'>
                                      <span>{record.success ? React.createElement(CheckOne, { size: 14, fill: '#10b981', theme: 'outline' }) : React.createElement(CloseOne, { size: 14, fill: '#ef4444', theme: 'outline' })}</span>
                                      <span className='stats-record-time'>
                                        {formatTime(record.timestamp)}
                                      </span>
                                      <span className='stats-record-duration'>{formatDuration(record.duration)}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
