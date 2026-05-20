import React, { useCallback } from 'react'
import { CloseOne } from '../utils/statusMessages'
import { ErrorBoundary } from '../components/common/ErrorBoundary'
import { Loading } from '../components/common/Loading'
import { MessageList } from '../components/chat/MessageList'
import { ChatInput } from '../components/chat/ChatInput'
import { useAutoScroll } from '../hooks/useAutoScroll'
import {
  useChatStore,
  selectMessages,
  selectIsProcessing,
  selectStreamingContent,
  selectAddMessage,
  selectSetProcessing,
  selectAppendStreamingContent,
  selectSetStreamingContent,
  selectFlushStreamingBuffer
} from '../stores/useChatStore'
import { ChatService } from '../services/chatService'
import { useSettingsStore } from '../stores/useSettingsStore'

function ChatPageContent() {
  const messages = useChatStore(selectMessages)
  const isProcessing = useChatStore(selectIsProcessing)
  const assistantName = useSettingsStore((s) => s.settings.assistantName)
  const streamingContent = useChatStore(selectStreamingContent)
  const addMessage = useChatStore(selectAddMessage)
  const setProcessing = useChatStore(selectSetProcessing)
  const appendStreamingContent = useChatStore(selectAppendStreamingContent)
  const setStreamingContent = useChatStore(selectSetStreamingContent)
  const flushStreamingBuffer = useChatStore(selectFlushStreamingBuffer)

  const { endRef: messagesEndRef, containerRef, handleScroll } = useAutoScroll([messages, streamingContent])

  const handleSend = useCallback((content: string) => {
    if (!content.trim() || isProcessing) return
    addMessage({ role: 'user', content })
    setProcessing(true)
    setStreamingContent('')

    ChatService.sendMessageStream(content, messages, {
      onChunk: (chunk) => { appendStreamingContent(chunk) },
      onToolCall: () => {},
      onDone: (fullText) => {
        flushStreamingBuffer()
        addMessage({ role: 'assistant', content: fullText })
        setStreamingContent('')
        setProcessing(false)
      },
      onError: (error) => {
        flushStreamingBuffer()
        addMessage({ role: 'assistant', content: React.createElement(CloseOne, { size: 14, fill: '#ef4444', theme: 'outline' }) + ' 错误：' + error, isError: true })
        setStreamingContent('')
        setProcessing(false)
      }
    })
  }, [messages, isProcessing, addMessage, setProcessing, appendStreamingContent, setStreamingContent, flushStreamingBuffer])

  const handleStop = useCallback(() => {
    ChatService.cancelStream()
    flushStreamingBuffer()
    if (streamingContent) {
      addMessage({ role: 'assistant', content: streamingContent })
    }
    setStreamingContent('')
    setProcessing(false)
  }, [streamingContent, addMessage, setProcessing, setStreamingContent, flushStreamingBuffer])

  const showLoading = isProcessing && !streamingContent

  return (
    <div className="chat-page">
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        containerRef={containerRef}
        endRef={messagesEndRef}
        onScroll={handleScroll}
      />
      {showLoading && <div className="chat-loading"><Loading size="sm" text={`${assistantName}正在思考…`} /></div>}
      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        onPasteImage={(dataUrl) => { addMessage({ role: 'user', content: '[图片]', images: [dataUrl] }) }}
        onAttachFile={(name, content) => {
          addMessage({ role: 'user', content: `📎 附件: ${name}\n\`\`\`\n${content}\n\`\`\`` })
        }}
        disabled={isProcessing}
      />
    </div>
  )
}

export function ChatPage() {
  return (
    <ErrorBoundary fallback={<div className="chat-error-fallback" role="alert"><div className="chat-error-icon">{React.createElement(CloseOne, { size: 32, fill: '#ef4444', theme: 'outline' })}</div><h3>聊天组件加载失败</h3><p>聊天界面遇到了渲染错误，请尝试刷新页面。</p><button className="btn btn-primary" onClick={() => window.location.reload()}>刷新页面</button></div>}>
      <ChatPageContent />
    </ErrorBoundary>
  )
}
