import React, { useState, useEffect, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleToolbar, FilterButtons } from '../../components/common/module/ModuleToolbar'

interface Theme {
  id: string; name: string; author: string; description: string; preview: string;
  mode: string; colors: Record<string, string>; source: string; active: boolean
}

export function ThemeStorePage() {
  const [themes, setThemes] = useState<Theme[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const loadThemes = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('theme_list')
      if (res?.success) setThemes(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadThemes() }, [loadThemes])

  const handleApply = async (id: string) => {
    setLoading(true)
    try { await window.electronAPI.invoke('theme_apply', { id }); loadThemes() } catch { /* ignore */ }
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
            <div className="theme-preview" style={{ background: `linear-gradient(135deg, ${t.colors.accent ?? '#6366f1'}, ${t.colors['accent-hover'] ?? t.colors.accent ?? '#818cf8'})` }}>
              {t.active && <span className="theme-badge-active">当前使用</span>}
              <span className="theme-badge-mode">{modeLabel(t.mode)}</span>
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
