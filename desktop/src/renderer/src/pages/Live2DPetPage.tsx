import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Live2DProvider } from '../components/live2d/Live2DContext'
import { Live2DCanvas } from '../components/live2d/Live2DCanvas'
import { Live2DFallback } from '../components/live2d/Live2DFallback'

/**
 * Live2D 桌面宠物独立页面
 * 透明窗口中展示 Live2D 模型
 * 支持：拖拽移动、滚轮缩放、右键菜单
 */
const Live2DPetPage: React.FC = () => {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingTimeout, setLoadingTimeout] = useState(false)
  const [showResizeUI, setShowResizeUI] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleReady = useCallback(() => setReady(true), [])
  const handleError = useCallback((msg: string) => setError(msg), [])

  // 挂载时清除背景，确保透明
  useEffect(() => {
    const htmlEl = document.documentElement
    const bodyEl = document.body
    const rootEl = document.getElementById('root')
    const prevHtml = htmlEl.style.background
    const prevBody = bodyEl.style.background
    const prevRoot = rootEl?.style.background
    htmlEl.style.background = 'transparent'
    bodyEl.style.background = 'transparent'
    if (rootEl) rootEl.style.background = 'transparent'
    return () => {
      htmlEl.style.background = prevHtml
      bodyEl.style.background = prevBody
      if (rootEl) rootEl.style.background = prevRoot ?? ''
    }
  }, [])

  // ========== 拖拽移动（原生DOM事件） ==========
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let isDragging = false
    let dragStart: { x: number; y: number; winX: number; winY: number } | null = null

    const onMouseDown = async (e: MouseEvent) => {
      if (e.button !== 0) return
      isDragging = true
      try {
        const bounds = await window.electronAPI.invoke('live2d:get-bounds')
        if (bounds) {
          dragStart = { x: e.screenX, y: e.screenY, winX: bounds.x, winY: bounds.y }
        }
      } catch { /* ignore */ }
    }

    const onMouseMove = async (e: MouseEvent) => {
      if (!isDragging || !dragStart) return
      const dx = e.screenX - dragStart.x
      const dy = e.screenY - dragStart.y
      try {
        await window.electronAPI.invoke('live2d:set-position', {
          x: dragStart.winX + dx,
          y: dragStart.winY + dy,
        })
      } catch { /* ignore */ }
    }

    const onMouseUp = () => {
      isDragging = false
      dragStart = null
    }

    const onWheel = async (e: WheelEvent) => {
      e.preventDefault()
      try {
        const bounds = await window.electronAPI.invoke('live2d:get-bounds')
        if (!bounds) return
        const delta = e.deltaY > 0 ? -20 : 20
        const aspectRatio = bounds.width / bounds.height
        const newWidth = Math.max(150, Math.min(600, bounds.width + delta))
        const newHeight = Math.max(200, Math.min(800, Math.round(newWidth / aspectRatio)))
        await window.electronAPI.invoke('live2d:set-size', { width: newWidth, height: newHeight })
      } catch { /* ignore */ }
    }

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      setShowResizeUI(v => !v)
    }

    container.addEventListener('mousedown', onMouseDown)
    container.addEventListener('mousemove', onMouseMove)
    container.addEventListener('mouseup', onMouseUp)
    container.addEventListener('mouseleave', onMouseUp)
    container.addEventListener('wheel', onWheel, { passive: false })
    container.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      container.removeEventListener('mousedown', onMouseDown)
      container.removeEventListener('mousemove', onMouseMove)
      container.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('mouseleave', onMouseUp)
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // 加载超时
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready && !error) setLoadingTimeout(true)
    }, 15000)
    return () => clearTimeout(timer)
  }, [ready, error])

  // ========== 预设尺寸 ==========
  const handlePresetSize = useCallback(async (width: number, height: number) => {
    try {
      await window.electronAPI.invoke('live2d:set-size', { width, height })
      setShowResizeUI(false)
    } catch { /* ignore */ }
  }, [])

  return (
    <Live2DProvider fallback={<Live2DFallback message="Live2D 模型加载失败" errorMessage={error ?? undefined} />}>
      <div
        ref={containerRef}
        style={{
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        {!ready && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
              🐱 加载中...
            </div>
            {loadingTimeout && (
              <div style={{ color: 'rgba(251,191,36,0.8)', fontSize: 12, textShadow: '0 1px 6px rgba(0,0,0,0.8)', textAlign: 'center', maxWidth: 200 }}>
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

        {/* 右键菜单 */}
        {showResizeUI && (
          <div
            style={{
              position: 'fixed',
              bottom: 60,
              right: 10,
              background: 'rgba(30, 30, 40, 0.95)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              zIndex: 100,
              minWidth: 140,
            }}
          >
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4, textAlign: 'center' }}>
              📐 调整大小
            </div>
            {[
              { label: '小 (200×260)', w: 200, h: 260, icon: '🔹' },
              { label: '中 (300×400)', w: 300, h: 400, icon: '🔸' },
              { label: '大 (400×530)', w: 400, h: 530, icon: '🔶' },
              { label: '特大 (500×660)', w: 500, h: 660, icon: '🔷' },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => void handlePresetSize(preset.w, preset.h)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(99, 102, 241, 0.3)'
                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                }}
              >
                {preset.icon} {preset.label}
              </button>
            ))}
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 4 }}>
              滚轮可微调大小
            </div>
          </div>
        )}

        {/* 操作提示 */}
        {ready && (
          <div
            style={{
              position: 'fixed',
              bottom: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 12,
              fontSize: 10,
              color: 'rgba(255,255,255,0.35)',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}
          >
            <span>🖱️ 拖拽移动</span>
            <span>⚙️ 滚轮缩放</span>
            <span>📌 右键调整</span>
          </div>
        )}
      </div>
    </Live2DProvider>
  )
}

export default Live2DPetPage
