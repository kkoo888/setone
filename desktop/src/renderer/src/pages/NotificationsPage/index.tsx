import React, { useState, useEffect, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleToolbar, FilterButtons } from '../../components/common/module/ModuleToolbar'
import { ModuleList, ModuleListItem } from '../../components/common/module/ModuleList'
import { EMPTY_ICONS, STATUS_ICONS, ACTION_ICONS, Remind, Tips, CheckOne, Help, CloseOne } from '../../utils/statusMessages'

const noticeIcon = React.createElement(Remind, { size: 16, fill: 'currentColor', theme: 'outline' })
const typeIcons: Record<string, React.ReactNode> = {
  info: React.createElement(Tips, { size: 14, fill: 'currentColor', theme: 'outline' }),
  success: React.createElement(CheckOne, { size: 14, fill: '#10b981', theme: 'outline' }),
  warning: React.createElement(Help, { size: 14, fill: '#f59e0b', theme: 'outline' }),
  error: React.createElement(CloseOne, { size: 14, fill: '#ef4444', theme: 'outline' }),
}

interface Notification { id: string; title: string; body: string; type: 'info' | 'success' | 'warning' | 'error'; read: boolean; createdAt: number }

const TYPE_ICON = typeIcons

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filter, setFilter] = useState('all')

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

  const unreadCount = notifications.filter(n => !n.read).length

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.read
    if (['info', 'success', 'warning', 'error'].includes(filter)) return n.type === filter
    return true
  })

  return (
    <div className="mod-page">
      <ModuleHeader
        icon={noticeIcon}
        title="通知中心"
        tabs={[
          { key: 'all', label: '全部' },
          { key: 'unread', label: '未读', count: unreadCount },
          { key: 'info', label: '信息' },
          { key: 'success', label: '成功' },
          { key: 'warning', label: '警告' },
          { key: 'error', label: '错误' },
        ]}
        activeTab={filter}
        onTabChange={setFilter}
        actions={
          <>
            <button onClick={handleMarkAllRead} className="btn btn-sm">全部已读</button>
            <button onClick={handleTest} className="btn btn-sm">{noticeIcon} 测试</button>
          </>
        }
      />

      <ModuleList emptyText="暂无通知" emptyIcon={EMPTY_ICONS.bell}>
        {filtered.map(n => (
          <ModuleListItem
            key={n.id}
            id={n.id}
            highlight={!n.read}
            icon={<span className="notif-type-icon">{TYPE_ICON[n.type] ?? typeIcons.info}</span>}
            title={n.title}
            subtitle={n.body}
            badge={!n.read ? <span className="notif-badge-new">新</span> : undefined}
            actions={
              <>
                {!n.read && <button onClick={() => handleMarkRead(n.id)} className="btn-icon-lg" title="已读">✓</button>}
                <button onClick={() => handleDelete(n.id)} className="btn-icon-lg" title="删除">{React.createElement(DeleteOne, { size: 14, fill: 'currentColor', theme: 'outline' })}</button>
              </>
            }
            extra={<span className="notif-time">{new Date(n.createdAt).toLocaleString()}</span>}
          />
        ))}
      </ModuleList>
    </div>
  )
}
