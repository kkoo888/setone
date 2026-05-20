import React, { useCallback } from 'react'
import { Clipboard, DeleteOne } from '../../utils/statusMessages'
import { useChatStore } from '../../stores/useChatStore'
import { showToast } from '../common/Toast'

interface Props {
  messageId: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

export function MessageActions({ messageId, role, content }: Props) {
  const deleteMessage = useChatStore((s) => s.deleteMessage)

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(content); showToast('已复制', { type: 'success' }) } catch { showToast('复制失败', { type: 'error' }) }
  }, [content])

  const handleDelete = useCallback(() => { if (window.confirm('确定删除这条消息？')) deleteMessage(messageId) }, [messageId, deleteMessage])

  return (
    <div className="message-actions" role="toolbar" aria-label="消息操作">
      <button className="message-action-btn ghost sm" onClick={handleCopy} title="复制消息" aria-label="复制消息">{React.createElement(Clipboard, { size: 14, fill: 'currentColor', theme: 'outline' })}</button>
      <button className="message-action-btn ghost sm" onClick={handleDelete} title="删除消息" aria-label="删除消息">{React.createElement(DeleteOne, { size: 14, fill: 'currentColor', theme: 'outline' })}</button>
    </div>
  )
}
