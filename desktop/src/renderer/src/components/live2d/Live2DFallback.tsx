import React from 'react'

interface Live2DFallbackProps { errorMessage?: string; onRetry?: () => void; message?: string }

export const Live2DFallback: React.FC<Live2DFallbackProps> = ({ errorMessage, onRetry, message = '当前处于文字模式' }) => {
  return (
    <div className="live2d-fallback" role="alert">
      <div className="fallback-icon" aria-hidden="true">🤖</div>
      <p className="fallback-message">{message}</p>
      {errorMessage && <p className="fallback-error" title={errorMessage}>{errorMessage.length > 100 ? `${errorMessage.slice(0, 100)}...` : errorMessage}</p>}
      {onRetry && <button className="fallback-retry-btn" onClick={onRetry}>重新加载</button>}
    </div>
  )
}

export default Live2DFallback
