import React, { useMemo } from 'react'
import { ToolCallCard } from './ToolCallCard'
import { MessageActions } from './MessageActions'
import { parseMarkdown, renderTokens } from './markdown'
import { useSettingsStore } from '../../stores/useSettingsStore'
import type { ChatMessage } from '../../stores/useChatStore'

interface Props { message: ChatMessage }

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const avatar = useSettingsStore((s) => s.settings.avatar)

  /** 根据消息状态决定头像情绪动画 */
  const emotion = useMemo(() => {
    if (message.isError) return 'avatar-emotion--shake'
    if (message.toolCalls?.some(tc => tc.status === 'running')) return 'avatar-emotion--pulse'
    return ''
  }, [message.isError, message.toolCalls])

  const renderedContent = useMemo(() => {
    if (isUser) return <span className="message-text">{message.content}</span>
    const tokens = parseMarkdown(message.content)
    return <span className="message-text message-markdown">{renderTokens(tokens)}</span>
  }, [message.content, isUser])

  return (
    <div className={`message-bubble ${isUser ? 'user' : isSystem ? 'system' : 'assistant'}${message.isError ? ' error' : ''}`}>
      {!isUser && (
        <div className={`message-avatar ${emotion}`}>
          {avatar ? (
            <img src={avatar} alt="" className="message-avatar-img" />
          ) : (
            <span className="message-avatar-emoji">{isSystem ? '⚙️' : '🌸'}</span>
          )}
        </div>
      )}
      <div className="message-content">
        <MessageActions messageId={message.id} role={message.role} content={message.content} />
        {renderedContent}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="tool-calls">
            {message.toolCalls.map((tc) => (<ToolCallCard key={tc.id} name={tc.name} arguments={tc.arguments} result={tc.result} error={tc.error} status={tc.status} durationMs={tc.durationMs} />))}
          </div>
        )}
        <div className="message-time">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
        </div>
      </div>
    </div>
  )
}
