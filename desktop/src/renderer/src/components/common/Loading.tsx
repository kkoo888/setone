import React from 'react'

interface LoadingProps { size?: 'sm' | 'md' | 'lg'; overlay?: boolean; spinner?: React.ReactNode; text?: string }

export function Loading({ size = 'md', overlay = false, spinner, text }: LoadingProps) {
  const content = (
    <div className={`loading loading-${size} ${overlay ? 'loading-overlay' : ''}`} role="status" aria-label={text ?? '加载中'}>
      {spinner ?? <div className="loading-spinner" />}
      {text && <span className="loading-text">{text}</span>}
    </div>
  )
  if (overlay) return <div className="loading-overlay-wrapper">{content}</div>
  return content
}
