/**
 * 快捷指令页面
 * 通过 hotkey_register / hotkey_list / hotkey_unregister 与后端 HotkeyService 交互
 * 快捷键定义持久化到 localStorage
 */
import React, { useState, useEffect, useCallback } from 'react'

interface Shortcut {
  id: string
  name: string
  accelerator: string
  description: string
  enabled: boolean
}

const STORAGE_KEY = 'setone_shortcuts'

/** 默认快捷键 */
const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: 'toggle-window', name: '显示/隐藏助手', accelerator: 'CommandOrControl+Shift+A', description: '切换主窗口显示', enabled: true },
  { id: 'command-palette', name: '命令面板', accelerator: 'CommandOrControl+K', description: '打开命令面板', enabled: true },
]

/** 从 localStorage 加载 */
function loadShortcuts(): Shortcut[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Shortcut[]
  } catch { /* ignore */ }
  return DEFAULT_SHORTCUTS
}

/** 保存到 localStorage */
function saveShortcuts(shortcuts: Shortcut[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts)) } catch { /* ignore */ }
}

export function ShortcutsPage() {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(loadShortcuts)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAccelerator, setNewAccelerator] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  /** 注册单个快捷键到系统 */
  const registerShortcut = useCallback(async (shortcut: Shortcut): Promise<boolean> => {
    try {
      const res = await window.electronAPI.invoke('hotkey_register', {
        accelerator: shortcut.accelerator,
        description: shortcut.description
      })
      return (res as { success?: boolean })?.success ?? false
    } catch { return false }
  }, [])

  /** 注销快捷键 */
  const unregisterShortcut = useCallback(async (accelerator: string): Promise<void> => {
    try {
      await window.electronAPI.invoke('hotkey_unregister', { accelerator })
    } catch { /* ignore */ }
  }, [])

  /** 页面加载时，注册所有已启用的快捷键 */
  useEffect(() => {
    const registerAll = async () => {
      setRegistering(true)
      for (const s of shortcuts) {
        if (s.enabled) {
          await registerShortcut(s)
        }
      }
      setRegistering(false)
    }
    registerAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 仅首次加载

  /** 持久化 */
  useEffect(() => {
    saveShortcuts(shortcuts)
  }, [shortcuts])

  /** 添加快捷键 */
  const handleAdd = async () => {
    if (!newName.trim() || !newAccelerator.trim()) return
    const accelerator = newAccelerator.trim()
    const newShortcut: Shortcut = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      accelerator,
      description: newDesc.trim(),
      enabled: true
    }

    // 先注册到系统
    const success = await registerShortcut(newShortcut)
    if (success) {
      setShortcuts(prev => [...prev, newShortcut])
      setShowAdd(false)
      setNewName('')
      setNewAccelerator('')
      setNewDesc('')
      setMessage({ type: 'success', text: `快捷键 ${accelerator} 注册成功` })
    } else {
      setMessage({ type: 'error', text: `快捷键 ${accelerator} 注册失败，可能已被占用` })
    }
    setTimeout(() => setMessage(null), 3000)
  }

  /** 切换启用/禁用 */
  const handleToggle = async (id: string) => {
    const target = shortcuts.find(s => s.id === id)
    if (!target) return

    if (target.enabled) {
      // 禁用 → 注销
      await unregisterShortcut(target.accelerator)
      setShortcuts(prev => prev.map(s => s.id === id ? { ...s, enabled: false } : s))
    } else {
      // 启用 → 注册
      const success = await registerShortcut(target)
      if (success) {
        setShortcuts(prev => prev.map(s => s.id === id ? { ...s, enabled: true } : s))
        setMessage({ type: 'success', text: `快捷键 ${target.accelerator} 已启用` })
      } else {
        setMessage({ type: 'error', text: `快捷键 ${target.accelerator} 注册失败` })
      }
      setTimeout(() => setMessage(null), 3000)
    }
  }

  /** 删除快捷键 */
  const handleDelete = async (id: string) => {
    const target = shortcuts.find(s => s.id === id)
    if (target?.enabled) {
      await unregisterShortcut(target.accelerator)
    }
    setShortcuts(prev => prev.filter(s => s.id !== id))
  }

  /** 编辑快捷键（进入编辑模式） */
  const handleEdit = (id: string) => {
    setEditingId(id)
    const target = shortcuts.find(s => s.id === id)
    if (target) {
      setNewName(target.name)
      setNewAccelerator(target.accelerator)
      setNewDesc(target.description)
      setShowAdd(true)
    }
  }

  /** 保存编辑 */
  const handleSaveEdit = async () => {
    if (!editingId || !newName.trim() || !newAccelerator.trim()) return
    const old = shortcuts.find(s => s.id === editingId)
    const accelerator = newAccelerator.trim()

    // 如果快捷键变了，先注销旧的再注册新的
    if (old && old.accelerator !== accelerator && old.enabled) {
      await unregisterShortcut(old.accelerator)
      const success = await registerShortcut({ ...old, accelerator, name: newName.trim(), description: newDesc.trim() })
      if (!success) {
        // 注册失败，恢复旧的
        await registerShortcut(old)
        setMessage({ type: 'error', text: `快捷键 ${accelerator} 注册失败` })
        setTimeout(() => setMessage(null), 3000)
        return
      }
    }

    setShortcuts(prev => prev.map(s => s.id === editingId ? {
      ...s, name: newName.trim(), accelerator, description: newDesc.trim()
    } : s))
    setShowAdd(false)
    setEditingId(null)
    setNewName('')
    setNewAccelerator('')
    setNewDesc('')
  }

  /** 取消编辑 */
  const handleCancelEdit = () => {
    setShowAdd(false)
    setEditingId(null)
    setNewName('')
    setNewAccelerator('')
    setNewDesc('')
  }

  return (
    <div className="shortcuts-page">
      <div className="shortcuts-header">
        <h1>⌨️ 快捷指令</h1>
        <button onClick={() => { setEditingId(null); setShowAdd(true) }} className="btn btn-primary">＋ 添加快捷键</button>
      </div>

      {/* 提示消息 */}
      {message && (
        <div className={`sc-message ${message.type === 'success' ? 'sc-message-success' : 'sc-message-error'}`}>
          {message.type === 'success' ? '✅' : '❌'} {message.text}
        </div>
      )}

      {/* 注册中提示 */}
      {registering && (
        <div className="sc-message sc-message-info">⏳ 正在注册快捷键...</div>
      )}

      {/* 添加/编辑表单 */}
      {showAdd && (
        <div className="sc-add-form">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="名称（如：显示/隐藏助手）" className="sc-input" />
          <input value={newAccelerator} onChange={e => setNewAccelerator(e.target.value)} placeholder="快捷键（如：Ctrl+Shift+A）" className="sc-input" />
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述" className="sc-input" />
          <div className="sc-form-hint">💡 格式：Ctrl/CommandOrControl+Shift+字母/功能键，如 Ctrl+Shift+A、CommandOrControl+K</div>
          <div className="sc-form-actions">
            <button onClick={editingId ? handleSaveEdit : handleAdd} className="btn btn-primary">{editingId ? '保存' : '添加'}</button>
            <button onClick={handleCancelEdit} className="btn">取消</button>
          </div>
        </div>
      )}

      {/* 快捷键列表 */}
      <div className="shortcuts-list">
        {shortcuts.length === 0 ? (
          <div className="shortcut-empty">
            <span>还没有快捷键，点击上方按钮添加</span>
          </div>
        ) : shortcuts.map(s => (
          <div key={s.id} className={`shortcut-item ${!s.enabled ? 'sc-disabled' : ''}`}>
            <div className="shortcut-keys">
              {s.accelerator.split('+').map((k, i) => (
                <span key={i}>
                  <kbd className="shortcut-key">{k.trim()}</kbd>
                  {i < s.accelerator.split('+').length - 1 && <span className="sc-key-sep">+</span>}
                </span>
              ))}
            </div>
            <div className="shortcut-info">
              <span className="shortcut-name">{s.name}</span>
              <span className="shortcut-desc">{s.description}</span>
            </div>
            <div className="shortcut-actions">
              <button onClick={() => handleToggle(s.id)} className="btn btn-sm">
                {s.enabled ? '⏸ 禁用' : '▶ 启用'}
              </button>
              <button onClick={() => handleEdit(s.id)} className="btn btn-sm">✏️ 编辑</button>
              <button onClick={() => handleDelete(s.id)} className="btn btn-danger btn-sm">🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
