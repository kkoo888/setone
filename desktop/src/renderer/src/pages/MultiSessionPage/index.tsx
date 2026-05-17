import React, { useState, useEffect, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleList, ModuleListItem } from '../../components/common/module/ModuleList'

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

  const renderSession = (s: Session) => (
    <ModuleListItem
      key={s.id}
      id={s.id}
      highlight={activeId === s.id}
      onClick={() => handleSwitch(s.id)}
      icon={s.pinned ? '📌' : '💬'}
      title={s.name}
      subtitle={`${s.model} · ${s.messageCount} 条消息`}
      actions={
        <>
          <button onClick={(e) => { e.stopPropagation(); handlePin(s.id) }} className="btn-icon-lg" title="固定">{s.pinned ? '📌' : '📍'}</button>
          <button onClick={(e) => { e.stopPropagation(); handleRename(s.id) }} className="btn-icon-lg" title="重命名">✏️</button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id) }} className="btn-icon-lg" title="删除">🗑</button>
        </>
      }
    />
  )

  return (
    <div className="mod-page">
      <ModuleHeader
        icon="💬"
        title="多会话管理"
        actions={<button onClick={() => setShowCreate(true)} className="btn btn-primary">＋ 新建会话</button>}
      />

      {showCreate && (
        <div style={{ padding: '0 24px 16px', display: 'flex', gap: 8, animation: 'scSlideDown 0.2s ease' }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="会话名称" className="mod-search" />
          <input value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="模型（可选）" className="mod-search" />
          <button onClick={handleCreate} className="btn btn-primary">创建</button>
          <button onClick={() => setShowCreate(false)} className="btn">取消</button>
        </div>
      )}

      <ModuleList emptyText="暂无会话" emptyIcon="💬">
        {pinned.map(renderSession)}
        {unpinned.map(renderSession)}
      </ModuleList>
    </div>
  )
}
