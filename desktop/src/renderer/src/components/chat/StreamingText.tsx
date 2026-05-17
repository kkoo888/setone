import React, { useState, useEffect, useRef, useMemo } from 'react'
import { parseMarkdown, renderTokens } from './markdown'
import { useSettingsStore } from '../../stores/useSettingsStore'

/** 流式输出过渡动画时长（毫秒） */
const STREAM_TRANSITION_DELAY_MS = 300
/** 动态字符速率的帧数分母 */
const CHAR_RATE_FRAME_DIVISOR = 60

interface StreamingTextProps {
  content: string
  charsPerFrame?: number
  onStreamEnd?: () => void
  markdown?: boolean
  className?: string
}

export function StreamingText({ content, charsPerFrame = 3, onStreamEnd, markdown = true, className = '' }: StreamingTextProps) {
  const assistantName = useSettingsStore((s) => s.settings.assistantName)
  const [displayedLength, setDisplayedLength] = useState(0)
  const [isStreaming, setIsStreaming] = useState(true)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const rafRef = useRef<number>(0)
  const prevContentRef = useRef('')
  const displayedLengthRef = useRef(0)

  useEffect(() => {
    if (content !== prevContentRef.current) { prevContentRef.current = content; setIsStreaming(true); setIsTransitioning(false) }
  }, [content])

  useEffect(() => {
    if (!isStreaming) return
    const targetLength = content.length
    const animate = () => {
      const current = displayedLengthRef.current
      if (current >= targetLength) { setIsStreaming(false); setIsTransitioning(true); setTimeout(() => { setIsTransitioning(false); onStreamEnd?.() }, STREAM_TRANSITION_DELAY_MS); return }
      const dynamicCharsPerFrame = Math.max(charsPerFrame, Math.floor((targetLength - current) / CHAR_RATE_FRAME_DIVISOR))
      const nextLength = Math.min(current + dynamicCharsPerFrame, targetLength)
      displayedLengthRef.current = nextLength
      setDisplayedLength(nextLength)
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [content, isStreaming, charsPerFrame, onStreamEnd])

  const renderedContent = useMemo(() => {
    const visibleText = content.slice(0, displayedLength)
    if (!markdown) return <span className="streaming-plain">{visibleText}</span>
    const tokens = parseMarkdown(visibleText)
    return <span className="streaming-markdown">{renderTokens(tokens)}</span>
  }, [content, displayedLength, markdown])

  const showCursor = isStreaming && displayedLength > 0 && displayedLength < content.length

  return (
    <div className={`streaming-text ${isTransitioning ? 'streaming-text--transitioning' : ''} ${className}`} role="status" aria-live="polite" aria-label={`${assistantName}正在回复`}>
      <div className="streaming-content">{renderedContent}</div>
      {showCursor && <span className="streaming-cursor" aria-hidden="true">▊</span>}
      {isTransitioning && <span className="streaming-fade-overlay" aria-hidden="true" />}
    </div>
  )
}
