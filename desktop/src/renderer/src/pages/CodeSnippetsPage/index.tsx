import React, { useState, useEffect, useCallback } from 'react'
import { EMPTY_ICONS, STATUS_ICONS, ACTION_ICONS } from '../../components/common/IconMap'
import { Scissor, Clipboard, DeleteOne } from '@icon-park/react'
const scissorI = React.createElement(Scissor, { size: 16, fill: 'currentColor', theme: 'outline' })
const clipI = React.createElement(Clipboard, { size: 14, fill: 'currentColor', theme: 'outline' })
const delI = React.createElement(DeleteOne, { size: 14, fill: 'currentColor', theme: 'outline' })
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleToolbar, FilterButtons } from '../../components/common/module/ModuleToolbar'
import { ModuleList, ModuleListItem, ModuleModal } from '../../components/common/module/ModuleList'

interface Snippet { id: string; title: string; language: string; code: string; description: string; tags: string[]; createdAt: number; usageCount: number }

export function CodeSnippetsPage() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [search, setSearch] = useState('')
  const [langFilter, setLangFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', language: 'javascript', code: '', description: '', tags: '' })

  const loadSnippets = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('snippet_list')
      if (res?.success) setSnippets(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadSnippets() }, [loadSnippets])

  const handleSave = async () => {
    if (!form.title.trim() || !form.code.trim()) return
    try {
      const payload = { ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) }
      if (editId) {
        await window.electronAPI.invoke('snippet_update', { id: editId, ...payload })
      } else {
        await window.electronAPI.invoke('snippet_create', payload)
      }
      setShowCreate(false); setEditId(null); setForm({ title: '', language: 'javascript', code: '', description: '', tags: '' }); loadSnippets()
    } catch { /* ignore */ }
  }

  const handleEdit = (s: Snippet) => {
    setEditId(s.id); setForm({ title: s.title, language: s.language, code: s.code, description: s.description, tags: s.tags.join(', ') }); setShowCreate(true)
  }

  const handleDelete = async (id: string) => {
    try { await window.electronAPI.invoke('snippet_delete', { id }); loadSnippets() } catch { /* ignore */ }
  }

  const handleCopy = async (code: string) => {
    try { await window.electronAPI.invoke('clipboard_write', { content: code }) } catch { /* ignore */ }
  }

  const handleUse = async (id: string) => {
    try { await window.electronAPI.invoke('snippet_use', { id }); loadSnippets() } catch { /* ignore */ }
  }

  const allLangs = ['all', ...new Set(snippets.map(s => s.language))]
  const filtered = snippets.filter(s => {
    if (langFilter !== 'all' && s.language !== langFilter) return false
    if (search && !s.title.toLowerCase().includes(search.toLowerCase()) && !s.code.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const langOptions = allLangs.map(l => ({ key: l, label: l === 'all' ? '全部语言' : l }))

  return (
    <div className="mod-page">
      <ModuleHeader
        icon={scissorI}
        title="代码片段"
        actions={
          <button onClick={() => { setShowCreate(true); setEditId(null); setForm({ title: '', language: 'javascript', code: '', description: '', tags: '' }) }} className="btn btn-primary">
            ＋ 新建片段
          </button>
        }
      />

      <ModuleToolbar search={search} onSearchChange={setSearch} searchPlaceholder="搜索代码片段...">
        <FilterButtons options={langOptions} active={langFilter} onChange={setLangFilter} />
      </ModuleToolbar>

      {/* 新建/编辑表单 */}
      {showCreate && (
        <ModuleModal title={editId ? '编辑片段' : '新建片段'} onClose={() => { setShowCreate(false); setEditId(null) }} footer={
          <>
            <button className="btn" onClick={() => { setShowCreate(false); setEditId(null) }}>取消</button>
            <button className="btn btn-primary" onClick={handleSave}>{editId ? '更新' : '保存'}</button>
          </>
        }>
          <div className="snippet-form">
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="标题" className="mod-search" />
            <select value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))} className="snippet-form-select">
              {['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c', 'cpp', 'html', 'css', 'sql', 'shell', 'json', 'yaml', 'markdown'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <textarea value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="代码内容..." rows={10} className="snippet-form-textarea" />
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="描述" className="mod-search" />
            <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="标签（逗号分隔）" className="mod-search" />
          </div>
        </ModuleModal>
      )}

      <ModuleList emptyText="暂无代码片段" emptyIcon={EMPTY_ICONS.scissors}>
        {filtered.map(s => (
          <ModuleListItem
            key={s.id}
            id={s.id}
            title={s.title}
            badge={<span className="badge-accent">{s.language}</span>}
            subtitle={s.description || s.code.slice(0, 150)}
            extra={
              <>
                <pre className="snippet-preview-code">
                  <code>{s.code.slice(0, 300)}{s.code.length > 300 ? '...' : ''}</code>
                </pre>
                {s.tags.length > 0 && (
                  <div className="snippet-form-tags">
                    {s.tags.map(t => <span key={t} className="badge-sm" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>{t}</span>)}
                  </div>
                )}
              </>
            }
            actions={
              <>
                <button onClick={(e) => { e.stopPropagation(); handleCopy(s.code) }} className="btn-icon-lg" title="复制">{clipI}</button>
                <button onClick={(e) => { e.stopPropagation(); handleUse(s.id) }} className="btn-icon-lg" title="使用">▶</button>
                <button onClick={(e) => { e.stopPropagation(); handleEdit(s) }} className="btn-icon-lg" title="编辑">{React.createElement(EditOne, { size: 14, fill: 'currentColor', theme: 'outline' })}</button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id) }} className="btn-icon-lg" title="删除">{delI}</button>
              </>
            }
          />
        ))}
      </ModuleList>
    </div>
  )
}
