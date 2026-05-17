import React, { useState, useEffect, useCallback } from 'react'

interface Session { id: string; name: string; model: string; messageCount: number; createdAt: number; lastActiveAt: number; pinned: boolean }

export function MultiSessionPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newModel, setNewModel] = useState('')

  const loadSessions = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('session_list')
      if (res?.success) setSessions(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      const res = await window.electronAPI.invoke('session_create', { name: newName, model: newModel || undefined })
      if (res?.success) { setShowCreate(false); setNewName(''); setNewModel(''); loadSessions() }
    } catch { /* ignore */ }
  }

  const handleSwitch = async (id: string) => {
    try { await window.electronAPI.invoke('session_switch', { id }); setActiveId(id) } catch { /* ignore */ }
  }

  const handleDelete = async (id: string) => {
    try { await window.electronAPI.invoke('session_delete', { id }); loadSessions() } catch { /* ignore */ }
  }

  const handleRename = async (id: string) => {
    const name = prompt('新名称:')
    if (!name) return
    try { await window.electronAPI.invoke('session_rename', { id, name }); loadSessions() } catch { /* ignore */ }
  }

  const handlePin = async (id: string) => {
    try { await window.electronAPI.invoke('session_pin', { id }); loadSessions() } catch { /* ignore */ }
  }

  const pinned = sessions.filter(s => s.pinned)
  const unpinned = sessions.filter(s => !s.pinned)

  return (
    <div className="sess-page">
      <div className="sess-header">
        <h1>💬 多会话管理</h1>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">＋ 新建会话</button>
      </div>
      {showCreate && (
        <div className="sess-create-form">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="会话名称" className="sess-input" />
          <input value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="模型（可选）" className="sess-input" />
          <div className="sess-form-actions">
            <button onClick={handleCreate} className="btn btn-primary">创建</button>
            <button onClick={() => setShowCreate(false)} className="btn">取消</button>
          </div>
        </div>
      )}
      {pinned.length > 0 && (
        <div className="sess-section">
          <h3>📌 已固定</h3>
          {pinned.map(s => (
            <div key={s.id} className={`sess-item ${activeId === s.id ? 'sess-active' : ''}`} onClick={() => handleSwitch(s.id)}>
              <div className="sess-info">
                <span className="sess-name">{s.name}</span>
                <span className="sess-meta">{s.model} · {s.messageCount} 条消息</span>
              </div>
              <div className="sess-actions" onClick={e => e.stopPropagation()}>
                <button onClick={() => handlePin(s.id)} className="btn btn-sm">📌</button>
                <button onClick={() => handleRename(s.id)} className="btn btn-sm">✏️</button>
                <button onClick={() => handleDelete(s.id)} className="btn btn-danger btn-sm">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="sess-section">
        {unpinned.length === 0 ? <div className="sess-empty">暂无会话</div> : unpinned.map(s => (
          <div key={s.id} className={`sess-item ${activeId === s.id ? 'sess-active' : ''}`} onClick={() => handleSwitch(s.id)}>
            <div className="sess-info">
              <span className="sess-name">{s.name}</span>
              <span className="sess-meta">{s.model} · {s.messageCount} 条消息</span>
            </div>
            <div className="sess-actions" onClick={e => e.stopPropagation()}>
              <button onClick={() => handlePin(s.id)} className="btn btn-sm">📌</button>
              <button onClick={() => handleRename(s.id)} className="btn btn-sm">✏️</button>
              <button onClick={() => handleDelete(s.id)} className="btn btn-danger btn-sm">🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
