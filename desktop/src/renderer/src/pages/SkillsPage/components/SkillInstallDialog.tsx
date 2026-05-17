/**
 * 技能安装弹窗
 * 与回收站弹窗风格一致，支持市场搜索和 URL 安装
 */
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useSkillStore } from '../../../stores/useSkillStore'
import { useSettingsStore } from '../../../stores/useSettingsStore'
import type { MarketSkill } from '../../../stores/useSkillStore'

/** 安装来源 Tab */
type InstallTab = 'market' | 'url'

interface SkillInstallDialogProps {
  onClose: () => void
}

/** 市场技能卡片 */
function MarketSkillCard({ skill, installing, onInstall }: {
  skill: MarketSkill
  installing: boolean
  onInstall: (id: string) => void
}) {
  return (
    <div className='skill-install-item'>
      <div className='skill-install-item-info'>
        <div className='skill-install-item-header'>
          <span className='skill-install-item-icon'>📦</span>
          <div>
            <span className='skill-install-item-name'>{skill.name}</span>
            <span className='skill-install-item-author'>by {skill.author}</span>
          </div>
          <span className='skill-install-item-version'>v{skill.version}</span>
        </div>
        <p className='skill-install-item-desc'>{skill.description}</p>
        <div className='skill-install-item-meta'>
          <span>⬇️ {skill.downloads.toLocaleString()}</span>
          <span>⭐ {skill.rating.toFixed(1)}</span>
          {skill.tags.length > 0 && (
            skill.tags.map((tag) => (
              <span key={tag} className='skill-install-tag'>{tag}</span>
            ))
          )}
        </div>
      </div>
      <button
        className='skill-install-btn skill-install-btn--install'
        disabled={installing}
        onClick={() => onInstall(skill.id)}
      >
        {installing ? '⏳ 安装中...' : '📥 安装'}
      </button>
    </div>
  )
}

export function SkillInstallDialog({ onClose }: SkillInstallDialogProps) {
  const {
    marketResults,
    marketLoading,
    installProgress,
    searchMarket,
    installFromMarket,
    installFromUrl
  } = useSkillStore()

  const networkEnabled = useSettingsStore((s) => s.settings.networkEnabled)
  const [activeTab, setActiveTab] = useState<InstallTab>('market')
  const [searchQuery, setSearchQuery] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 防抖搜索 */
  useEffect(() => {
    if (!networkEnabled || activeTab !== 'market') return
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      if (searchQuery.trim()) searchMarket(searchQuery)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchQuery, activeTab, networkEnabled, searchMarket])

  /** 按 ESC 关闭 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
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
    (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() },
    [onClose]
  )

  /** 从市场安装 */
  const handleMarketInstall = useCallback(async (skillId: string) => {
    setInstallingId(skillId)
    const success = await installFromMarket(skillId)
    setInstallingId(null)
    if (success) onClose()
  }, [installFromMarket, onClose])

  /** 从 URL 安装 */
  const handleUrlInstall = useCallback(async () => {
    const url = urlInput.trim()
    if (!url) { setUrlError('请输入 URL'); return }
    try { new URL(url) } catch { setUrlError('请输入有效的 URL'); return }
    setUrlError(null)
    const success = await installFromUrl(url)
    if (success) onClose()
  }, [urlInput, installFromUrl, onClose])

  /** 回车搜索 */
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && searchQuery.trim()) searchMarket(searchQuery)
    },
    [searchQuery, searchMarket]
  )

  return (
    <div className='skill-install-overlay' onClick={handleOverlayClick} role='dialog' aria-modal='true' aria-label='添加技能'>
      <div className='skill-install-dialog'>
        {/* 头部 */}
        <div className='skill-install-header'>
          <div className='skill-install-header-left'>
            <span className='skill-install-icon' aria-hidden='true'>📥</span>
            <h2 className='skill-install-title'>添加技能</h2>
          </div>
          <button className='skill-install-close' onClick={onClose} aria-label='关闭'>✕</button>
        </div>

        {/* Tab 切换 */}
        <div className='skill-install-tabs'>
          <button
            className={`skill-install-tab${activeTab === 'market' ? ' active' : ''}`}
            onClick={() => setActiveTab('market')}
          >
            🏪 市场搜索
          </button>
          <button
            className={`skill-install-tab${activeTab === 'url' ? ' active' : ''}`}
            onClick={() => setActiveTab('url')}
          >
            🔗 URL 安装
          </button>
        </div>

        {/* 内容 */}
        <div className='skill-install-body'>
          {/* 市场搜索 Tab */}
          {activeTab === 'market' && (
            !networkEnabled ? (
              <div className='skill-install-empty'>
                <span className='skill-install-empty-icon'>🔌</span>
                <span className='skill-install-empty-text'>网络已断开，请先恢复网络后再搜索技能市场</span>
              </div>
            ) : (
              <>
                <div className='skill-install-search'>
                  <span className='skill-install-search-icon'>🔍</span>
                  <input
                    type='text'
                    className='skill-install-search-input'
                    placeholder='搜索技能...'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    autoFocus
                  />
                </div>
                <div className='skill-install-results'>
                  {marketLoading ? (
                    <div className='skill-install-empty'>
                      <span className='skill-install-empty-icon'>⏳</span>
                      <span className='skill-install-empty-text'>搜索中...</span>
                    </div>
                  ) : marketResults.length === 0 ? (
                    <div className='skill-install-empty'>
                      <span className='skill-install-empty-icon'>{searchQuery ? '🔍' : '💡'}</span>
                      <span className='skill-install-empty-text'>
                        {searchQuery ? '没有找到匹配的技能' : '输入关键词搜索技能市场'}
                      </span>
                    </div>
                  ) : (
                    marketResults.map((skill) => (
                      <MarketSkillCard
                        key={skill.id}
                        skill={skill}
                        installing={installingId === skill.id}
                        onInstall={handleMarketInstall}
                      />
                    ))
                  )}
                </div>
              </>
            )
          )}

          {/* URL 安装 Tab */}
          {activeTab === 'url' && (
            <div className='skill-install-url-form'>
              <label className='skill-install-url-label'>
                输入技能来源 URL
                <span className='skill-install-url-hint'>支持 GitHub 仓库地址或 .zip 下载链接</span>
              </label>
              <input
                type='text'
                className='skill-install-url-input'
                placeholder='https://github.com/user/skill-repo'
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setUrlError(null) }}
                autoFocus
              />
              {urlError && <p className='skill-install-url-error'>{urlError}</p>}
              <button
                className='skill-install-btn skill-install-btn--url'
                disabled={!!installProgress}
                onClick={handleUrlInstall}
              >
                {installProgress || '🔗 安装'}
              </button>
            </div>
          )}
        </div>

        {/* 安装进度 */}
        {installProgress && (
          <div className='skill-install-progress'>
            <span>⏳</span>
            <span>{installProgress}</span>
          </div>
        )}
      </div>
    </div>
  )
}
