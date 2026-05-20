/**
 * 快捷指令页面 - 手风琴展开样式
 * 每个词条下方内联展开编辑表单
 */
import React, { useState, useEffect, useCallback } from 'react'
import { Tips, CheckOne, CloseOne, PauseOne, PlayOne, EditOne, DeleteOne } from '../../utils/statusMessages'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'

interface Shortcut {
  id: string
  name: string
  accelerator: string
  description: string
  enabled: boolean
}

const STORAGE_KEY = 'setone_shortcuts'

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: 'toggle-window', name: '显示/隐藏助手', accelerator: 'CommandOrControl+Shift+A', description: '切换主窗口显示', enabled: true },
  { id: 'command-palette', name: '命令面板', accelerator: 'CommandOrControl+K', description: '打开命令面板', enabled: true },
]

function loadShortcuts(): Shortcut[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Shortcut[]
  } catch { /* ignore */ }
  return DEFAULT_SHORTCUTS
}

function saveShortcuts(shortcuts: Shortcut[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts)) } catch { /* ignore */ }
}

export function ShortcutsPage() {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(loadShortcuts)
  /** 当前展开的词条 ID（null = 没有展开） */
  const [expandedId, setExpandedId] = useState<string | null>(null)
  /** 展开模式：'add' = 新增, 'edit' = 编辑 */
  const [expandedMode, setExpandedMode] = useState<'add' | 'edit'>('add')
  const [formName, setFormName] = useState('')
  const [formAccelerator, setFormAccelerator] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const registerShortcut = useCallback(async (shortcut: Shortcut): Promise<boolean> => {
    try {
      const res = await window.electronAPI.invoke('hotkey_register', {
        accelerator: shortcut.accelerator,
        description: shortcut.description
      })
      return (res as { success?: boolean })?.success ?? false
    } catch { return false }
  }, [])

  const unregisterShortcut = useCallback(async (accelerator: string): Promise<void> => {
    try {
      await window.electronAPI.invoke('hotkey_unregister', { accelerator })
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const registerAll = async () => {
      for (const s of shortcuts) {
        if (s.enabled) await registerShortcut(s)
      }
    }
    registerAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { saveShortcuts(shortcuts) }, [shortcuts])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  /** 展开新增表单（挂在列表末尾） */
  const handleStartAdd = () => {
    setExpandedId('__add__')
    setExpandedMode('add')
    setFormName('')
    setFormAccelerator('')
    setFormDesc('')
  }

  /** 展开编辑表单（挂在对应词条下方） */
  const handleStartEdit = (id: string) => {
    const target = shortcuts.find(s => s.id === id)
    if (!target) return
    setExpandedId(id)
    setExpandedMode('edit')
    setFormName(target.name)
    setFormAccelerator(target.accelerator)
    setFormDesc(target.description)
  }

  /** 收起表单 */
  const handleCollapse = () => {
    setExpandedId(null)
    setFormName('')
    setFormAccelerator('')
    setFormDesc('')
  }

  /** 提交新增 */
  const handleAdd = async () => {
    if (!formName.trim() || !formAccelerator.trim()) return
    const accelerator = formAccelerator.trim()
    const newShortcut: Shortcut = {
      id: `custom-${Date.now()}`,
      name: formName.trim(),
      accelerator,
      description: formDesc.trim(),
      enabled: true
    }
    const success = await registerShortcut(newShortcut)
    if (success) {
      setShortcuts(prev => [...prev, newShortcut])
      handleCollapse()
      showMessage('success', `快捷键 ${accelerator} 注册成功`)
    } else {
      showMessage('error', `快捷键 ${accelerator} 注册失败，可能已被占用`)
    }
  }

  /** 提交编辑 */
  const handleSaveEdit = async () => {
    if (!expandedId || !formName.trim() || !formAccelerator.trim()) return
    const old = shortcuts.find(s => s.id === expandedId)
    const accelerator = formAccelerator.trim()

    if (old && old.accelerator !== accelerator && old.enabled) {
      await unregisterShortcut(old.accelerator)
      const success = await registerShortcut({ ...old, accelerator, name: formName.trim(), description: formDesc.trim() })
      if (!success) {
        await registerShortcut(old)
        showMessage('error', `快捷键 ${accelerator} 注册失败`)
        return
      }
    }

    setShortcuts(prev => prev.map(s => s.id === expandedId ? {
      ...s, name: formName.trim(), accelerator, description: formDesc.trim()
    } : s))
    handleCollapse()
  }

  const handleToggle = async (id: string) => {
    const target = shortcuts.find(s => s.id === id)
    if (!target) return
    if (target.enabled) {
      await unregisterShortcut(target.accelerator)
      setShortcuts(prev => prev.map(s => s.id === id ? { ...s, enabled: false } : s))
    } else {
      const success = await registerShortcut(target)
      if (success) {
        setShortcuts(prev => prev.map(s => s.id === id ? { ...s, enabled: true } : s))
      } else {
        showMessage('error', `快捷键 ${target.accelerator} 注册失败`)
      }
    }
  }

  const handleDelete = async (id: string) => {
    const target = shortcuts.find(s => s.id === id)
    if (target?.enabled) await unregisterShortcut(target.accelerator)
    if (expandedId === id) handleCollapse()
    setShortcuts(prev => prev.filter(s => s.id !== id))
  }

  /** 渲染内联编辑表单 */
  const renderForm = (onSubmit: () => void, submitLabel: string) => (
    <div className="sc-inline-form">
      <div className="sc-inline-form-row">
        <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="名称" className="sc-input" />
        <input value={formAccelerator} onChange={e => setFormAccelerator(e.target.value)} placeholder="快捷键（如 Ctrl+Shift+A）" className="sc-input" />
      </div>
      <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="描述（可选）" className="sc-input" />
      <div className="sc-form-hint">{tipsI} 格式：Ctrl/CommandOrControl+Shift+字母/功能键</div>
      <div className="sc-form-actions">
        <button onClick={onSubmit} className="btn btn-primary">{submitLabel}</button>
        <button onClick={handleCollapse} className="btn">取消</button>
      </div>
    </div>
  )

  return (
    <div className="shortcuts-page mod-page">
      <ModuleHeader
        icon="⌨️"
        title="快捷指令"
        actions={<button onClick={handleStartAdd} className="btn btn-primary">＋ 添加快捷键</button>}
      />

      {message && (
        <div className={`sc-message ${message.type === 'success' ? 'sc-message-success' : 'sc-message-error'}`}>
          {message.type === 'success' ? checkI : closeI} {message.text}
        </div>
      )}

      <div className="shortcuts-list">
        {shortcuts.length === 0 && expandedId !== '__add__' ? (
          <div className="shortcut-empty">
            <span>还没有快捷键，点击上方按钮添加</span>
          </div>
        ) : shortcuts.map(s => (
          <React.Fragment key={s.id}>
            <div className={`shortcut-item ${!s.enabled ? 'sc-disabled' : ''} ${expandedId === s.id ? 'sc-expanded' : ''}`}>
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
                  {s.enabled ? <>{pauseI} 禁用</> : <>{playI} 启用</>}
                </button>
                <button onClick={() => handleStartEdit(s.id)} className="btn btn-sm">{editI} 编辑</button>
                <button onClick={() => handleDelete(s.id)} className="btn btn-danger btn-sm">{delI}</button>
              </div>
            </div>
            {/* 手风琴：编辑表单内联在对应词条下方 */}
            {expandedId === s.id && expandedMode === 'edit' && renderForm(handleSaveEdit, '保存')}
          </React.Fragment>
        ))}

        {/* 新增表单挂在列表末尾 */}
        {expandedId === '__add__' && (
          <div className="sc-inline-form-wrapper">
            {renderForm(handleAdd, '添加')}
          </div>
        )}
      </div>
    </div>
  )
}
