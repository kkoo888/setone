import React, { useState, useEffect, useCallback } from 'react'
import { EMPTY_ICONS, STATUS_ICONS, ACTION_ICONS, Clipboard, Pushpin, DeleteOne, Location } from '../../utils/statusMessages'
const clipI = React.createElement(Clipboard, { size: 16, fill: 'currentColor', theme: 'outline' })
const pinI = React.createElement(Pushpin, { size: 14, fill: 'currentColor', theme: 'outline' })
const locI = React.createElement(Location, { size: 14, fill: 'currentColor', theme: 'outline' })
const delI = React.createElement(DeleteOne, { size: 14, fill: 'currentColor', theme: 'outline' })
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleToolbar, FilterButtons } from '../../components/common/module/ModuleToolbar'
import { ModuleList, ModuleListItem } from '../../components/common/module/ModuleList'

interface ClipItem { id: string; content: string; type: 'text' | 'image' | 'file'; createdAt: number; pinned: boolean }

export function ClipboardHistoryPage() {
  const [clips, setClips] = useState<ClipItem[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

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
    try { await window.electronAPI.invoke('clipboard_pin', { id }); loadClips() } catch { /* ignore */ }
  }

  const handleDelete = async (id: string) => {
    try { await window.electronAPI.invoke('clipboard_delete', { id }); loadClips() } catch { /* ignore */ }
  }

  const handleClear = async () => {
    try { await window.electronAPI.invoke('clipboard_clear'); loadClips() } catch { /* ignore */ }
  }

  const filtered = clips.filter(c => {
    if (filter !== 'all' && c.type !== filter) return false
    if (search && !c.content.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const pinned = filtered.filter(c => c.pinned)
  const unpinned = filtered.filter(c => !c.pinned)

  return (
    <div className="mod-page">
      <ModuleHeader
        icon={clipI}
        title="剪贴板历史"
        actions={<button onClick={handleClear} className="btn btn-danger btn-sm">清空历史</button>}
      />

      <ModuleToolbar search={search} onSearchChange={setSearch} searchPlaceholder="搜索剪贴板...">
        <FilterButtons
          options={[
            { key: 'all', label: '全部' },
            { key: 'text', label: '📝 文本' },
            { key: 'image', label: '🖼 图片' },
            { key: 'file', label: '📁 文件' },
          ]}
          active={filter}
          onChange={setFilter}
        />
      </ModuleToolbar>

      <ModuleList emptyText="暂无剪贴板记录" emptyIcon={EMPTY_ICONS.clipboard}>
        {pinned.map(c => (
          <ModuleListItem
            key={c.id}
            id={c.id}
            highlight
            icon={pinI}
            title={c.type === 'text' ? c.content.slice(0, 100) : `[${c.type}] ${c.content}`}
            subtitle={new Date(c.createdAt).toLocaleString()}
            actions={
              <>
                <button onClick={() => handleCopy(c.id)} className="btn-icon-lg" title="复制">{clipI}</button>
                <button onClick={() => handlePin(c.id)} className="btn-icon-lg" title="取消固定">{pinI}</button>
                <button onClick={() => handleDelete(c.id)} className="btn-icon-lg" title="删除">{delI}</button>
              </>
            }
          />
        ))}
        {unpinned.map(c => (
          <ModuleListItem
            key={c.id}
            id={c.id}
            title={c.type === 'text' ? c.content.slice(0, 100) : `[${c.type}] ${c.content}`}
            subtitle={new Date(c.createdAt).toLocaleString()}
            actions={
              <>
                <button onClick={() => handleCopy(c.id)} className="btn-icon-lg" title="复制">{clipI}</button>
                <button onClick={() => handlePin(c.id)} className="btn-icon-lg" title="固定">{pinI}</button>
                <button onClick={() => handleDelete(c.id)} className="btn-icon-lg" title="删除">{delI}</button>
              </>
            }
          />
        ))}
      </ModuleList>
    </div>
  )
}
