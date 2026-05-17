import React, { useState, useEffect, useCallback } from 'react'

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

  return (
    <div className="snip-page">
      <div className="snip-header">
        <h1>✂️ 代码片段</h1>
        <button onClick={() => { setShowCreate(true); setEditId(null); setForm({ title: '', language: 'javascript', code: '', description: '', tags: '' }) }} className="btn btn-primary">＋ 新建片段</button>
      </div>
      <div className="snip-toolbar">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索..." className="snip-search" />
        <select value={langFilter} onChange={e => setLangFilter(e.target.value)} className="snip-select">
          {allLangs.map(l => <option key={l} value={l}>{l === 'all' ? '全部语言' : l}</option>)}
        </select>
      </div>
      {showCreate && (
        <div className="snip-create-form">
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="标题" className="snip-input" />
          <select value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))} className="snip-select">
            {['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c', 'cpp', 'html', 'css', 'sql', 'shell', 'json', 'yaml', 'markdown'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <textarea value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="代码内容..." className="snip-code-input" rows={8} />
          <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="描述" className="snip-input" />
          <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="标签（逗号分隔）" className="snip-input" />
          <div className="snip-form-actions">
            <button onClick={handleSave} className="btn btn-primary">{editId ? '更新' : '保存'}</button>
            <button onClick={() => { setShowCreate(false); setEditId(null) }} className="btn">取消</button>
          </div>
        </div>
      )}
      <div className="snip-list">
        {filtered.length === 0 ? <div className="snip-empty">暂无代码片段</div> : filtered.map(s => (
          <div key={s.id} className="snip-card">
            <div className="snip-card-header">
              <span className="snip-title">{s.title}</span>
              <span className="snip-lang">{s.language}</span>
              <span className="snip-usage">使用 {s.usageCount} 次</span>
            </div>
            {s.description && <div className="snip-desc">{s.description}</div>}
            <pre className="snip-code"><code>{s.code.slice(0, 300)}{s.code.length > 300 ? '...' : ''}</code></pre>
            {s.tags.length > 0 && <div className="snip-tags">{s.tags.map(t => <span key={t} className="snip-tag">{t}</span>)}</div>}
            <div className="snip-actions">
              <button onClick={() => handleCopy(s.code)} className="btn btn-sm">📋 复制</button>
              <button onClick={() => handleUse(s.id)} className="btn btn-primary btn-sm">▶ 使用</button>
              <button onClick={() => handleEdit(s)} className="btn btn-sm">✏️ 编辑</button>
              <button onClick={() => handleDelete(s.id)} className="btn btn-danger btn-sm">🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
