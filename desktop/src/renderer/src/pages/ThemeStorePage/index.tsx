/**
 * 主题商店页面 v2.0
 * 
 * 升级内容：
 * 1. 支持 v2 格式主题（seed + overrides）
 * 2. 增强预览卡片（mini 组件预览）
 * 3. 支持 mode + theme 解耦
 */
import React, { useState, useEffect, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleToolbar, FilterButtons } from '../../components/common/module/ModuleToolbar'
import { useTheme } from '../../hooks/useTheme'
import type { ThemeConfigV2, ThemeConfigV1 } from '../../services/themeEngine'

interface Theme {
  id: string; name: string; author: string; description: string
  mode: string; colors: Record<string, string>; source: string; active: boolean
}

export function ThemeStorePage() {
  const [themes, setThemes] = useState<Theme[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const { applyTheme } = useTheme()

  const loadThemes = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('theme_list')
      if (res?.success) setThemes(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadThemes() }, [loadThemes])

  const handleApply = async (id: string) => {
    setLoading(true)
    try {
      // 先获取完整主题数据
      const themeRes = await window.electronAPI.invoke('theme_get', { id })
      if (themeRes?.success && themeRes.data) {
        // 通过 themeEngine 应用
        applyTheme(themeRes.data as ThemeConfigV2 | ThemeConfigV1)
      }
      // 通知主进程
      await window.electronAPI.invoke('theme_apply', { id })
      loadThemes()
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleImport = async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI.invoke('theme_import')
      if (!res?.success && res?.error && res.error !== '已取消') {
        console.warn('导入失败:', res.error)
      }
      loadThemes()
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    try { await window.electronAPI.invoke('theme_delete', { id }); loadThemes() } catch { /* ignore */ }
  }

  const handleExport = async (id: string) => {
    try { await window.electronAPI.invoke('theme_export', { id }) } catch { /* ignore */ }
  }

  const filtered = themes.filter(t => {
    if (filter === 'builtin' && t.source !== 'builtin') return false
    if (filter === 'imported' && t.source !== 'imported') return false
    if (filter === 'available' && t.source !== 'available') return false
    if (filter === 'light' && t.mode !== 'light') return false
    if (filter === 'dark' && t.mode !== 'dark') return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const modeLabel = (mode: string) => mode === 'light' ? '☀️ 亮色' : '🌙 暗色'
  const sourceLabel = (source: string) => source === 'builtin' ? '内置' : source === 'imported' ? '已导入' : '可下载'

  /** 渐变预览色 */
  const getPreviewGradient = (t: Theme) => {
    const accent = t.colors.accent || '#6366f1'
    const bg = t.colors['bg-primary'] || (t.mode === 'dark' ? '#1a1a2e' : '#ffffff')
    return `linear-gradient(135deg, ${accent}22 0%, ${accent}44 50%, ${bg} 100%)`
  }

  return (
    <div className="mod-page">
      <ModuleHeader
        icon="🎨"
        title="主题商店"
        actions={<button className="btn btn-primary btn-sm" onClick={handleImport} disabled={loading}>📥 导入主题</button>}
      />

      <ModuleToolbar search={search} onSearchChange={setSearch} searchPlaceholder="搜索主题...">
        <FilterButtons
          options={[
            { key: 'all', label: '全部' },
            { key: 'builtin', label: '🏠 内置' },
            { key: 'imported', label: '📥 已导入' },
            { key: 'available', label: '📦 可下载' },
            { key: 'light', label: '☀️ 亮色' },
            { key: 'dark', label: '🌙 暗色' },
          ]}
          active={filter}
          onChange={setFilter}
        />
      </ModuleToolbar>

      <div className="theme-grid">
        {filtered.map(t => (
          <div key={t.id} className={`theme-card ${t.active ? 'theme-active' : ''}`}>
            {/* 增强预览区：显示主色、背景色、文字色 */}
            <div className="theme-preview" style={{ background: getPreviewGradient(t) }}>
              {t.active && <span className="theme-badge-active">当前使用</span>}
              <span className="theme-badge-mode">{modeLabel(t.mode)}</span>
              {/* 色值展示 */}
              <div style={{
                display: 'flex', gap: 6, position: 'absolute', bottom: 8, left: 12, right: 12,
                justifyContent: 'center',
              }}>
                {['accent', 'bg-primary', 'text-primary'].map(key => (
                  <div key={key} style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: t.colors[key] || '#888',
                    border: '2px solid rgba(255,255,255,0.5)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} title={`${key}: ${t.colors[key] || 'N/A'}`} />
                ))}
              </div>
            </div>
            <div className="theme-info">
              <div className="theme-name">{t.name}</div>
              <div className="theme-author">by {t.author} · {sourceLabel(t.source)}</div>
              <div className="theme-desc">{t.description}</div>
            </div>
            <div className="theme-actions">
              <button onClick={() => handleApply(t.id)} disabled={loading || t.active} className="btn btn-primary btn-sm">
                {t.active ? '已启用' : t.source === 'available' ? '📥 下载并应用' : '应用'}
              </button>
              <button onClick={() => handleExport(t.id)} className="btn btn-sm">📦 导出</button>
              {t.source === 'imported' && !t.active && (
                <button onClick={() => handleDelete(t.id)} className="btn btn-danger btn-sm">🗑 删除</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
