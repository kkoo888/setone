import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'

interface Props {
  onSend: (content: string) => void
  onStop?: () => void
  onPasteImage?: (dataUrl: string) => void
  onAttachFile?: (name: string, content: string) => void
  disabled?: boolean
}

const MAX_INPUT_LENGTH = 2000

export function ChatInput({ onSend, onStop, onPasteImage, onAttachFile, disabled }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const assistantName = useSettingsStore((s) => s.settings.assistantName)

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
    }
  }, [value])

  const handleSubmit = () => {
    if (disabled) {
      onStop?.()
      return
    }
    if (!value.trim()) return
    onSend(value.trim())
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardData = e.clipboardData
      if (!clipboardData) return

      const imageItems = Array.from(clipboardData.items).filter((item) =>
        item.type.startsWith('image/')
      )
      if (imageItems.length > 0) {
        e.preventDefault()
        for (const item of imageItems) {
          const file = item.getAsFile()
          if (!file) continue
          const reader = new FileReader()
          reader.onload = () => {
            onPasteImage?.(reader.result as string)
          }
          reader.readAsDataURL(file)
        }
        return
      }

      const pastedText = clipboardData.getData('text/plain')
      if (pastedText && pastedText.includes('\n')) {
        e.preventDefault()
        const singleLine = pastedText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
          .join(' ')
        const textarea = textareaRef.current
        if (textarea) {
          const start = textarea.selectionStart
          const end = textarea.selectionEnd
          const newValue = value.slice(0, start) + singleLine + value.slice(end)
          const capped = newValue.slice(0, MAX_INPUT_LENGTH)
          setValue(capped)
          requestAnimationFrame(() => {
            const pos = Math.min(start + singleLine.length, MAX_INPUT_LENGTH)
            textarea.setSelectionRange(pos, pos)
          })
        }
      }
    },
    [value, onPasteImage]
  )

  const charCount = value.length
  const isNearLimit = charCount > MAX_INPUT_LENGTH * 0.9
  const isOverLimit = charCount > MAX_INPUT_LENGTH
  const canSend = value.trim() && !isOverLimit

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <button
          className="chat-input-attach"
          onClick={async () => {
            try {
              const result = await window.electronAPI.invoke('files:openPicker') as {
                canceled?: boolean
                name?: string
                content?: string
                error?: string
              }
              if (!result.canceled && result.content && result.name) {
                onAttachFile?.(result.name, result.content)
              } else if (result.error) {
                console.error('文件读取失败:', result.error)
              }
            } catch (err) {
              console.error('文件选择失败:', err)
            }
          }}
          title="添加附件"
          aria-label="添加附件"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 4v12M4 10h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={disabled ? `${assistantName}回复中，可继续输入…` : '输入消息...'}
          rows={1}
          maxLength={MAX_INPUT_LENGTH}
          aria-label="输入消息"
          aria-describedby="input-char-count"
        />
        <span
          id="input-char-count"
          className={`chat-input-charcount ${isNearLimit ? 'chat-input-charcount--warn' : ''} ${isOverLimit ? 'chat-input-charcount--error' : ''}`}
          aria-live="polite"
        >
          {charCount}/{MAX_INPUT_LENGTH}
        </span>
      </div>
      <button
        className={`chat-send-btn ${disabled ? 'chat-send-btn--stop' : ''}`}
        onClick={handleSubmit}
        disabled={!canSend && !disabled}
        title={disabled ? '停止生成' : '发送'}
        aria-label={disabled ? '停止生成' : '发送'}
      >
        {disabled ? (
          // 停止图标 (方形)
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="2" />
          </svg>
        ) : (
          // 发送图标 (纸飞机)
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        )}
      </button>
    </div>
  )
}
