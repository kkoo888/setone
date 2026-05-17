import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  moduleId?: string
  isStreaming?: boolean
  images?: string[]
  toolCalls?: Array<{
    id: string
    name: string
    arguments?: Record<string, unknown>
    result?: unknown
    error?: string
    status?: 'running' | 'success' | 'error'
    durationMs?: number
  }>
  isError?: boolean
}

interface ChatState {
  messages: ChatMessage[]
  isProcessing: boolean
  streamingContent: string
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  deleteMessage: (id: string) => void
  clearMessages: () => void
  setProcessing: (value: boolean) => void
  setStreamingContent: (content: string) => void
  appendStreamingContent: (chunk: string) => void
  flushStreamingBuffer: () => void
}

let _streamBuffer = ''
let _rafId: ReturnType<typeof requestAnimationFrame> | null = null

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set) => ({
    messages: [],
    isProcessing: false,
    streamingContent: '',
    addMessage: (message) => {
      const newMessage: ChatMessage = { ...message, id: crypto.randomUUID(), timestamp: Date.now() }
      _streamBuffer = ''
      if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null }
      set((state) => ({ messages: [...state.messages, newMessage], streamingContent: '' }))
    },
    updateMessage: (id, updates) => {
      set((state) => {
        const idx = state.messages.findIndex((m) => m.id === id)
        if (idx === -1) return state
        const updated = [...state.messages]
        updated[idx] = { ...updated[idx], ...updates }
        return { messages: updated }
      })
    },
    deleteMessage: (id) => {
      set((state) => {
        const idx = state.messages.findIndex((m) => m.id === id)
        if (idx === -1) return state
        return { messages: state.messages.filter((m) => m.id !== id) }
      })
    },
    clearMessages: () => set({ messages: [] }),
    setProcessing: (value) => set({ isProcessing: value }),
    setStreamingContent: (content) => { _streamBuffer = ''; set({ streamingContent: content }) },
    appendStreamingContent: (chunk) => {
      _streamBuffer += chunk
      if (_rafId === null) {
        _rafId = requestAnimationFrame(() => {
          _rafId = null
          const buffered = _streamBuffer
          _streamBuffer = ''
          if (buffered) { set((state) => ({ streamingContent: state.streamingContent + buffered })) }
        })
      }
    },
    flushStreamingBuffer: () => {
      if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null }
      const buffered = _streamBuffer
      _streamBuffer = ''
      if (buffered) { set((state) => ({ streamingContent: state.streamingContent + buffered })) }
    }
  }))
)

export const selectMessages = (s: ChatState) => s.messages
export const selectIsProcessing = (s: ChatState) => s.isProcessing
export const selectStreamingContent = (s: ChatState) => s.streamingContent
export const selectAddMessage = (s: ChatState) => s.addMessage
export const selectSetProcessing = (s: ChatState) => s.setProcessing
export const selectAppendStreamingContent = (s: ChatState) => s.appendStreamingContent
export const selectSetStreamingContent = (s: ChatState) => s.setStreamingContent
export const selectFlushStreamingBuffer = (s: ChatState) => s.flushStreamingBuffer
