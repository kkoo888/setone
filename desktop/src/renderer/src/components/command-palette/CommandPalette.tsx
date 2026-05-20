import React, { useEffect, useRef, useCallback } from 'react'
import { useCommandPaletteStore } from '../../stores/useCommandPaletteStore'
import { ACTION_ICONS } from '../common/IconMap'
import '../../styles/command-palette.css'

const CATEGORY_LABELS: Record<string, string> = {
  navigation: '导航',
  skill: '技能',
  module: '模块',
  setting: '设置',
  file: '文件',
  chat: '聊天',
  tool: '工具',
  custom: '自定义'
}

export function CommandPalette() {
  const {
    isOpen, query, results, selectedIndex, loading,
    close, setQuery, moveUp, moveDown, executeSelected, setSelectedIndex
  } = useCommandPaletteStore()

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 全局快捷键 Ctrl+K 打开
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        if (isOpen) {
          close()
        } else {
          useCommandPaletteStore.getState().open()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])

  // 监听主进程 palette:open 事件
  useEffect(() => {
    const unsub = window.electronAPI.on('palette:open', (data: { query?: string }) => {
      useCommandPaletteStore.getState().open(data?.query)
    })
    return unsub
  }, [])

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'ArrowUp':
        e.preventDefault()
        moveUp()
        break
      case 'ArrowDown':
        e.preventDefault()
        moveDown()
        break
      case 'Enter':
        e.preventDefault()
        executeSelected()
        break
      case 'Tab':
        e.preventDefault()
        if (e.shiftKey) moveUp()
        else moveDown()
        break
    }
  }, [close, moveUp, moveDown, executeSelected])

  // 滚动选中项到可见区域
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const selected = list.children[selectedIndex] as HTMLElement
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!isOpen) return null

  return (
    <div className="palette-overlay" onClick={close}>
      <div className="palette-container" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="palette-input-wrapper">
          <span className="palette-input-icon">{ACTION_ICONS.search}</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="输入命令..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <kbd className="palette-esc">Esc</kbd>
        </div>

        <div className="palette-results" ref={listRef}>
          {loading && <div className="palette-empty">搜索中...</div>}

          {!loading && results.length === 0 && (
            <div className="palette-empty">
              {query ? '没有匹配的命令' : '输入关键词搜索命令'}
            </div>
          )}

          {!loading && results.map((result, index) => (
            <div
              key={result.id}
              className={`palette-item${index === selectedIndex ? ' palette-item--selected' : ''}`}
              onClick={() => {
                setSelectedIndex(index)
                executeSelected()
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="palette-item-icon">{result.icon ?? ACTION_ICONS.clipboard}</span>
              <div className="palette-item-text">
                <span className="palette-item-label">{result.label}</span>
                {result.description && (
                  <span className="palette-item-desc">{result.description}</span>
                )}
              </div>
              <span className="palette-item-category">{CATEGORY_LABELS[result.category] ?? result.category}</span>
              {result.shortcut && <kbd className="palette-shortcut">{result.shortcut}</kbd>}
            </div>
          ))}
        </div>

        <div className="palette-footer">
          <span className="palette-hint">↑↓ 导航</span>
          <span className="palette-hint">Enter 执行</span>
          <span className="palette-hint">Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
