import React, { useState, useEffect, useCallback } from 'react'

interface ClipItem { id: string; content: string; type: 'text' | 'image' | 'file'; createdAt: number; pinned: boolean }

export function ClipboardHistoryPage() {
  const [clips, setClips] = useState<ClipItem[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'text' | 'image' | 'file'>('all')

  const loadClips = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('clipboard_list', { limit: 200 })
      if (res?.success) setClips(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadClips() }, [loadClips])

  const handleCopy = async (id: string) => {
    try { await window.electronAPI.invoke('clipboard_copy', { id }) } catch { /* ignore */ }
  }

  const handlePin = async (id: string) => {
    try {
      await window.electronAPI.invoke('clipboard_pin', { id })
      loadClips()
    } catch { /* ignore */ }
  }

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.invoke('clipboard_delete', { id })
      loadClips()
    } catch { /* ignore */ }
  }

  const handleClear = async () => {
    try {
      await window.electronAPI.invoke('clipboard_clear')
      loadClips()
    } catch { /* ignore */ }
  }

  const filtered = clips.filter(c => {
    if (filter !== 'all' && c.type !== filter) return false
    if (search && !c.content.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const pinned = filtered.filter(c => c.pinned)
  const unpinned = filtered.filter(c => !c.pinned)

  return (
    <div className="clip-page">
      <div className="clip-header">
        <h1>📋 剪贴板历史</h1>
        <button onClick={handleClear} className="btn btn-danger btn-sm">清空历史</button>
      </div>
      <div className="clip-toolbar">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索..." className="clip-search" />
        <div className="clip-filters">
          {(['all', 'text', 'image', 'file'] as const).map(f => (
            <button key={f} className={`tab-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? '全部' : f === 'text' ? '📝 文本' : f === 'image' ? '🖼 图片' : '📁 文件'}
            </button>
          ))}
        </div>
      </div>
      {pinned.length > 0 && (
        <div className="clip-section">
          <h3>📌 已固定</h3>
          {pinned.map(c => (
            <div key={c.id} className="clip-item clip-pinned">
              <div className="clip-content">{c.type === 'text' ? c.content.slice(0, 200) : `[${c.type}] ${c.content}`}</div>
              <div className="clip-actions">
                <button onClick={() => handleCopy(c.id)} className="btn btn-sm">📋 复制</button>
                <button onClick={() => handlePin(c.id)} className="btn btn-sm">📌 取消固定</button>
                <button onClick={() => handleDelete(c.id)} className="btn btn-danger btn-sm">🗑</button>
              </div>
              <div className="clip-time">{new Date(c.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
      <div className="clip-section">
        {unpinned.length === 0 ? <div className="clip-empty">暂无剪贴板记录</div> : unpinned.map(c => (
          <div key={c.id} className="clip-item">
            <div className="clip-content">{c.type === 'text' ? c.content.slice(0, 200) : `[${c.type}] ${c.content}`}</div>
            <div className="clip-actions">
              <button onClick={() => handleCopy(c.id)} className="btn btn-sm">📋 复制</button>
              <button onClick={() => handlePin(c.id)} className="btn btn-sm">📌 固定</button>
              <button onClick={() => handleDelete(c.id)} className="btn btn-danger btn-sm">🗑</button>
            </div>
            <div className="clip-time">{new Date(c.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
