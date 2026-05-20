import React from 'react'
import { MessageBubble } from './MessageBubble'
import { StreamingText } from './StreamingText'
import { useSettingsStore } from '../../stores/useSettingsStore'
import type { ChatMessage } from '../../stores/useChatStore'

interface Props {
  messages: ChatMessage[]
  streamingContent: string
  containerRef?: React.RefObject<HTMLDivElement | null>
  endRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
}

export function MessageList({ messages, streamingContent, containerRef, endRef, onScroll }: Props) {
  const avatar = useSettingsStore((s) => s.settings.avatar)
  return (
    <div
      className="message-list"
      role="log"
      aria-label="对话消息列表"
      aria-live="polite"
      ref={containerRef}
      onScroll={onScroll}
    >
      {messages.length === 0 && !streamingContent && (
        <div className="empty-state">
          <p>开始和我聊天吧！</p>
          <p className="empty-hint">输入消息或问我任何问题</p>
        </div>
      )}
      {messages.map((msg) => (<MessageBubble key={msg.id} message={msg} />))}
      {streamingContent && (
        <div className="message-bubble assistant streaming">
          <div className="message-avatar avatar-emotion--bounce">
            {avatar ? <img src={avatar} alt="" className="message-avatar-img" /> : <span className="message-avatar-emoji">🌸</span>}
          </div>
          <div className="message-content"><StreamingText content={streamingContent} /></div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}
