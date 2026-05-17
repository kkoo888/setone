import React, { useState } from 'react'

interface Shortcut { id: string; name: string; keys: string[]; description: string; enabled: boolean }

export function ShortcutsPage() {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([
    { id: '1', name: '显示/隐藏助手', keys: ['Ctrl', 'Shift', 'A'], description: '切换主窗口显示', enabled: true },
    { id: '2', name: '命令面板', keys: ['Ctrl', 'K'], description: '打开命令面板', enabled: true },
  ])
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKeys, setNewKeys] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const handleAdd = () => {
    if (!newName.trim() || !newKeys.trim()) return
    setShortcuts(prev => [...prev, {
      id: Date.now().toString(), name: newName, keys: newKeys.split('+').map(k => k.trim()),
      description: newDesc, enabled: true
    }])
    setShowAdd(false); setNewName(''); setNewKeys(''); setNewDesc('')
  }

  const handleToggle = (id: string) => {
    setShortcuts(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
  }

  const handleDelete = (id: string) => {
    setShortcuts(prev => prev.filter(s => s.id !== id))
  }

  const handleTest = async (keys: string[]) => {
    try { await window.electronAPI.invoke('keyboard_shortcut', { keys }) } catch { /* ignore */ }
  }

  return (
    <div className="sc-page">
      <div className="sc-header">
        <h1>⌨️ 快捷指令</h1>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary">＋ 添加快捷键</button>
      </div>

      {showAdd && (
        <div className="sc-add-form">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="名称" className="sc-input" />
          <input value={newKeys} onChange={e => setNewKeys(e.target.value)} placeholder="快捷键 (如 Ctrl+Shift+A)" className="sc-input" />
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述" className="sc-input" />
          <div className="sc-form-actions">
            <button onClick={handleAdd} className="btn btn-primary">添加</button>
            <button onClick={() => setShowAdd(false)} className="btn">取消</button>
          </div>
        </div>
      )}

      <div className="sc-list">
        {shortcuts.map(s => (
          <div key={s.id} className={`sc-item ${!s.enabled ? 'sc-disabled' : ''}`}>
            <div className="sc-info">
              <span className="sc-name">{s.name}</span>
              <span className="sc-keys">{s.keys.join(' + ')}</span>
              <span className="sc-desc">{s.description}</span>
            </div>
            <div className="sc-actions">
              <button onClick={() => handleTest(s.keys)} className="btn btn-sm">▶ 测试</button>
              <button onClick={() => handleToggle(s.id)} className="btn btn-sm">{s.enabled ? '禁用' : '启用'}</button>
              <button onClick={() => handleDelete(s.id)} className="btn btn-danger btn-sm">🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
