import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Live2DProvider } from '../components/live2d/Live2DContext'
import { Live2DCanvas } from '../components/live2d/Live2DCanvas'
import { Live2DFallback } from '../components/live2d/Live2DFallback'

/**
 * Live2D 桌面宠物独立页面
 * 透明窗口中展示 Live2D 模型
 * 支持：拖拽移动、滚轮缩放、右键菜单、鼠标跟随、点击互动
 */
const Live2DPetPage: React.FC = () => {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingTimeout, setLoadingTimeout] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showResizeUI, setShowResizeUI] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; winX: number; winY: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

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

  // ========== 鼠标穿透动态控制 ==========
  const isOverModelRef = useRef(false)
  const lastCheckTimeRef = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let tmpCanvas: HTMLCanvasElement | null = null
    let tmpCtx: CanvasRenderingContext2D | null = null

    const checkPixelHit = (e: MouseEvent): boolean => {
      const canvas = container.querySelector('canvas')
      if (!canvas) return false
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(e.clientX - rect.left)
      const y = Math.floor(e.clientY - rect.top)
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false
      try {
        if (!tmpCanvas || tmpCanvas.width !== canvas.width || tmpCanvas.height !== canvas.height) {
          tmpCanvas = document.createElement('canvas')
          tmpCanvas.width = canvas.width
          tmpCanvas.height = canvas.height
          tmpCtx = tmpCanvas.getContext('2d')
        }
        if (!tmpCtx) return false
        tmpCtx.drawImage(canvas, 0, 0)
        const pixel = tmpCtx.getImageData(x, y, 1, 1).data
        return pixel[3] > 10
      } catch {
        return false
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      // 拖拽中不切换穿透状态
      if (isDraggingRef.current) return
      const now = Date.now()
      if (now - lastCheckTimeRef.current < 50) return
      lastCheckTimeRef.current = now

      const overModel = checkPixelHit(e)
      if (overModel === isOverModelRef.current) return
      isOverModelRef.current = overModel
      window.electronAPI.invoke('live2d:set-ignore-mouse', !overModel).catch(() => {})
    }

    const handleMouseDown = (e: MouseEvent) => {
      // 点击时确保取消穿透，让事件能被接收
      if (isOverModelRef.current) {
        window.electronAPI.invoke('live2d:set-ignore-mouse', false).catch(() => {})
      }
    }

    const handleMouseLeave = () => {
      if (!isOverModelRef.current) return
      isOverModelRef.current = false
      window.electronAPI.invoke('live2d:set-ignore-mouse', true).catch(() => {})
    }

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('mouseleave', handleMouseLeave)
    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('mouseleave', handleMouseLeave)
      tmpCanvas = null
      tmpCtx = null
    }
  }, [])

  // 加载超时
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready && !error) setLoadingTimeout(true)
    }, 15000)
    return () => clearTimeout(timer)
  }, [ready, error])

  // ========== 拖拽移动 ==========
  const handleMouseDown = useCallback(async (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('.pet-resize-handle') || target.closest('.pet-resize-menu')) return

    setIsDragging(true)
    isDraggingRef.current = true
    // 拖拽开始时确保穿透关闭
    window.electronAPI.invoke('live2d:set-ignore-mouse', false).catch(() => {})
    try {
      const bounds = await window.electronAPI.invoke('live2d:get-bounds')
      if (bounds) {
        dragStartRef.current = {
          x: e.screenX,
          y: e.screenY,
          winX: bounds.x,
          winY: bounds.y,
        }
      }
    } catch { /* ignore */ }
  }, [])

  const handleMouseMove = useCallback(async (e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current) return
    const dx = e.screenX - dragStartRef.current.x
    const dy = e.screenY - dragStartRef.current.y
    try {
      await window.electronAPI.invoke('live2d:set-position', {
        x: dragStartRef.current.winX + dx,
        y: dragStartRef.current.winY + dy,
      })
    } catch { /* ignore */ }
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)
    isDraggingRef.current = false
    dragStartRef.current = null
  }, [isDragging])

  // ========== 滚轮缩放 ==========
  const handleWheel = useCallback(async (e: React.WheelEvent) => {
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
  }, [])

  // ========== 右键菜单 ==========
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setShowResizeUI((v) => !v)
  }, [])

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
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
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
            className="pet-resize-menu"
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
                className="pet-resize-handle"
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
        {ready && !isDragging && (
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
