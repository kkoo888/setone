import React from 'react'
import { Robot, Refresh } from '../../utils/statusMessages'

interface Live2DFallbackProps { errorMessage?: string; onRetry?: () => void; message?: string }

export const Live2DFallback: React.FC<Live2DFallbackProps> = ({ errorMessage, onRetry, message = '当前处于文字模式' }) => {
  return (
    <div className="live2d-fallback" role="alert">
      <div className="fallback-icon" aria-hidden="true">{React.createElement(Robot, { size: 48, fill: '#9ca3af', theme: 'outline' })}</div>
      <p className="fallback-message">{message}</p>
      {errorMessage && <p className="fallback-error" title={errorMessage}>{errorMessage.length > 100 ? `${errorMessage.slice(0, 100)}...` : errorMessage}</p>}
      {onRetry && <button className="fallback-retry-btn" onClick={onRetry}>{React.createElement(Refresh, { size: 14, fill: 'currentColor', theme: 'outline' })} 重新加载</button>}
    </div>
  )
}

export default Live2DFallback
