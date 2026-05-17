import React, { useState, useCallback, useEffect } from 'react'
import { Live2DProvider } from '../components/live2d/Live2DContext'
import { Live2DCanvas } from '../components/live2d/Live2DCanvas'
import { Live2DFallback } from '../components/live2d/Live2DFallback'

/**
 * Live2D 桌面宠物独立页面
 * 用于在透明窗口中展示 Live2D 模型
 */
const Live2DPetPage: React.FC = () => {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingTimeout, setLoadingTimeout] = useState(false)

  const handleReady = useCallback(() => setReady(true), [])
  const handleError = useCallback((msg: string) => setError(msg), [])

  // 加载超时检测：15秒后如果还没加载成功，显示超时提示
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready && !error) {
        setLoadingTimeout(true)
      }
    }, 15000)
    return () => clearTimeout(timer)
  }, [ready, error])

  return (
    <Live2DProvider fallback={<Live2DFallback message="Live2D 模型加载失败" errorMessage={error ?? undefined} />}>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!ready && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ color: '#fff', fontSize: 14, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
              🐱 加载中...
            </div>
            {loadingTimeout && (
              <div style={{ color: '#fbbf24', fontSize: 12, textShadow: '0 1px 3px rgba(0,0,0,0.5)', textAlign: 'center', maxWidth: 200 }}>
                ⏳ 加载时间较长，请检查模型文件是否正常
              </div>
            )}
          </div>
        )}
        <Live2DCanvas
          width="100%"
          height="100%"
          onReady={handleReady}
          onError={handleError}
        />
      </div>
    </Live2DProvider>
  )
}

export default Live2DPetPage
