import React, { useState, useEffect, useCallback } from 'react'

interface Notification { id: string; title: string; body: string; type: 'info' | 'success' | 'warning' | 'error'; read: boolean; createdAt: number }

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filter, setFilter] = useState<'all' | 'unread' | 'info' | 'success' | 'warning' | 'error'>('all')

  const loadNotifications = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('notification_list', { limit: 100 })
      if (res?.success) setNotifications(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadNotifications() }, [loadNotifications])

  const handleMarkRead = async (id: string) => {
    try { await window.electronAPI.invoke('notification_read', { id }); loadNotifications() } catch { /* ignore */ }
  }

  const handleMarkAllRead = async () => {
    try { await window.electronAPI.invoke('notification_read_all'); loadNotifications() } catch { /* ignore */ }
  }

  const handleDelete = async (id: string) => {
    try { await window.electronAPI.invoke('notification_delete', { id }); loadNotifications() } catch { /* ignore */ }
  }

  const handleTest = async () => {
    try { await window.electronAPI.invoke('notify', { title: '测试通知', body: '这是一条测试通知' }); loadNotifications() } catch { /* ignore */ }
  }

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.read
    if (['info', 'success', 'warning', 'error'].includes(filter)) return n.type === filter
    return true
  })

  const unreadCount = notifications.filter(n => !n.read).length
  const icon = (type: string) => ({ info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' }[type] ?? 'ℹ️')

  return (
    <div className="notif-page">
      <div className="notif-header">
        <h1>🔔 通知中心</h1>
        <div className="notif-header-actions">
          {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          <button onClick={handleMarkAllRead} className="btn btn-sm">全部已读</button>
          <button onClick={handleTest} className="btn btn-sm">🔔 测试</button>
        </div>
      </div>
      <div className="notif-filters">
        {(['all', 'unread', 'info', 'success', 'warning', 'error'] as const).map(f => (
          <button key={f} className={`tab-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? '全部' : f === 'unread' ? '未读' : f}
          </button>
        ))}
      </div>
      <div className="notif-list">
        {filtered.length === 0 ? <div className="notif-empty">暂无通知</div> : filtered.map(n => (
          <div key={n.id} className={`notif-item ${!n.read ? 'notif-unread' : ''}`}>
            <span className="notif-icon">{icon(n.type)}</span>
            <div className="notif-body">
              <div className="notif-title">{n.title}</div>
              <div className="notif-text">{n.body}</div>
              <div className="notif-time">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
            <div className="notif-actions">
              {!n.read && <button onClick={() => handleMarkRead(n.id)} className="btn btn-sm">已读</button>}
              <button onClick={() => handleDelete(n.id)} className="btn btn-danger btn-sm">🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
