/**
 * Live2D Cubism 5 宠物窗口页面
 * 在独立 renderer 进程中运行，使用 Cubism 5 原生 WebGL 渲染
 *
 * 修复：
 * - 拖拽：通过 invoke 通知主进程，主进程通过 BrowserWindow API 处理
 * - 清理：destroy 时通知主进程清理完成，避免资源泄漏
 * - WebGL 上下文丢失：监听事件并提示用户
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'

/** electronAPI 最小接口 */
interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void
  notifyCleanupDone?: () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

type PetState = 'idle' | 'loading' | 'loaded' | 'error'

const Live2D5PetPage: React.FC = () => {
  const [state, setState] = useState<PetState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [contextLost, setContextLost] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const serviceRef = useRef<Awaited<ReturnType<typeof loadCubism5Service>> | null>(null)

  /** 动态加载 Cubism 5 服务 */
  const loadCubism5Service = async () => {
    const { cubism5Service } = await import('@modules/live2d-5/services/cubism5-service')
    return cubism5Service
  }

  // 加载模型
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!containerRef.current) return

      try {
        setState('loading')
        const service = await loadCubism5Service()
        serviceRef.current = service

        service.setStateCallback((s) => {
          if (!cancelled) {
            setState(s === 'idle' ? 'idle' : s === 'loading' ? 'loading' : s === 'loaded' ? 'loaded' : 'error')
          }
        })

        await service.loadModel(
          {
            name: 'Hiyori',
            modelPath: new URL('/live2d/Hiyori/Hiyori.model3.json', window.location.origin).href,
            scale: 0.15,
          },
          containerRef.current
        )

        if (!cancelled) setState('loaded')
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败')
          setState('error')
        }
      }
    }

    load()

    return () => {
      cancelled = true
      serviceRef.current?.destroy()
      serviceRef.current = null
    }
  }, [])

  // 监听 WebGL 上下文丢失/恢复
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleContextLost = () => setContextLost(true)
    const handleContextRestored = () => setContextLost(false)

    const canvas = container.querySelector('canvas')
    if (canvas) {
      canvas.addEventListener('webglcontextlost', handleContextLost)
      canvas.addEventListener('webglcontextrestored', handleContextRestored)
    }

    return () => {
      if (canvas) {
        canvas.removeEventListener('webglcontextlost', handleContextLost)
        canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      }
    }
  }, [state])

  // 监听主进程 IPC 事件（表情/动作/拖拽/销毁）
  useEffect(() => {
    if (!window.electronAPI) return

    const cleanups: Array<() => void> = []

    cleanups.push(
      window.electronAPI.on('live2d5:set-expression', (expressionId: unknown) => {
        if (typeof expressionId === 'string' && serviceRef.current) {
          serviceRef.current.setExpression(expressionId)
        }
      })
    )

    cleanups.push(
      window.electronAPI.on('live2d5:play-motion', (motionId: unknown) => {
        if (typeof motionId === 'string' && serviceRef.current) {
          serviceRef.current.playMotion(motionId)
        }
      })
    )

    cleanups.push(
      window.electronAPI.on('live2d5:start-drag', () => {
        // 主进程通知 renderer 端开始拖拽
        // 使用 mousedown + IPC 配合实现窗口移动
      })
    )

    cleanups.push(
      window.electronAPI.on('live2d5:destroy', () => {
        // 清理 WebGL 资源
        serviceRef.current?.destroy()
        serviceRef.current = null
        // 通知主进程清理完成
        window.electronAPI?.notifyCleanupDone?.()
      })
    )

    return () => cleanups.forEach((fn) => fn())
  }, [])

  // 拖拽支持 — 通过 IPC 通知主进程处理窗口移动
  useEffect(() => {
    let dragging = false

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragging = true
      // 通知主进程开始拖拽（主进程会处理窗口移动）
      window.electronAPI?.invoke('live2d5:request-drag')
    }

    const handleMouseUp = () => {
      dragging = false
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // 重试
  const handleRetry = useCallback(async () => {
    setError(null)
    setState('idle')
    if (serviceRef.current) {
      serviceRef.current.destroy()
      serviceRef.current = null
    }
    // 触发重新加载
    if (containerRef.current) {
      containerRef.current.innerHTML = ''
    }
  }, [])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'transparent',
        position: 'relative',
      }}
    >
      {/* 模型渲染容器 */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />

      {/* 加载状态 */}
      {state === 'loading' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a78bfa',
            fontSize: 14,
          }}
        >
          加载 Cubism 5 模型中...
        </div>
      )}

      {/* WebGL 上下文丢失提示 */}
      {contextLost && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)',
            color: '#fbbf24',
            fontSize: 14,
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span>⚠️ WebGL 上下文丢失，等待恢复...</span>
          <button
            onClick={handleRetry}
            style={{
              background: 'rgba(99,102,241,0.8)',
              color: 'white',
              border: 'none',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            重新加载
          </button>
        </div>
      )}

      {/* 错误提示 + 重试 */}
      {state === 'error' && error && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              background: 'rgba(220,38,38,0.9)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
          <button
            onClick={handleRetry}
            style={{
              background: 'rgba(99,102,241,0.8)',
              color: 'white',
              border: 'none',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      )}

      {/* Cubism 5 标识 */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          fontSize: 10,
          color: 'rgba(255,255,255,0.4)',
          pointerEvents: 'none',
        }}
      >
        C5
      </div>
    </div>
  )
}

export default Live2D5PetPage
