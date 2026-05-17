import React, { useState, useEffect, useCallback } from 'react'

interface Theme { id: string; name: string; author: string; description: string; preview: string; colors: Record<string, string>; installed: boolean; active: boolean }

export function ThemeStorePage() {
  const [themes, setThemes] = useState<Theme[]>([])
  const [filter, setFilter] = useState<'all' | 'installed' | 'store'>('all')
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

  const handleInstall = async (id: string) => {
    setLoading(true)
    try { await window.electronAPI.invoke('theme_install', { id }); loadThemes() } catch { /* ignore */ }
    setLoading(false)
  }

  const handleUninstall = async (id: string) => {
    try { await window.electronAPI.invoke('theme_uninstall', { id }); loadThemes() } catch { /* ignore */ }
  }

  const handleExport = async (id: string) => {
    try { await window.electronAPI.invoke('theme_export', { id }) } catch { /* ignore */ }
  }

  const filtered = themes.filter(t => {
    if (filter === 'installed' && !t.installed) return false
    if (filter === 'store' && t.installed) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="theme-page">
      <div className="theme-header">
        <h1>🎨 主题商店</h1>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索主题..." className="theme-search" />
      </div>
      <div className="theme-filters">
        {(['all', 'installed', 'store'] as const).map(f => (
          <button key={f} className={`tab-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? '全部' : f === 'installed' ? '已安装' : '商店'}
          </button>
        ))}
      </div>
      <div className="theme-grid">
        {filtered.map(t => (
          <div key={t.id} className={`theme-card ${t.active ? 'theme-active' : ''}`}>
            <div className="theme-preview" style={{ background: `linear-gradient(135deg, ${t.colors.primary ?? '#4a9eff'}, ${t.colors.accent ?? '#a855f7'})` }}>
              {t.active && <span className="theme-badge-active">当前使用</span>}
            </div>
            <div className="theme-info">
              <div className="theme-name">{t.name}</div>
              <div className="theme-author">by {t.author}</div>
              <div className="theme-desc">{t.description}</div>
            </div>
            <div className="theme-actions">
              {t.installed ? (
                <>
                  <button onClick={() => handleApply(t.id)} disabled={loading || t.active} className="btn btn-primary btn-sm">{t.active ? '已启用' : '应用'}</button>
                  <button onClick={() => handleExport(t.id)} className="btn btn-sm">📦 导出</button>
                  {!t.active && <button onClick={() => handleUninstall(t.id)} className="btn btn-danger btn-sm">卸载</button>}
                </>
              ) : (
                <button onClick={() => handleInstall(t.id)} disabled={loading} className="btn btn-primary btn-sm">📥 安装</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
