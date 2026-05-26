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
import { Help } from '../utils/statusMessages'

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
  const [shaderReady, setShaderReady] = useState(false)
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
      console.log('[Live2D5PetPage] 🚀 组件挂载, 开始加载流程...')
      if (!containerRef.current) {
        console.error('[Live2D5PetPage] ❌ containerRef.current 为空, 无法加载')
        return
      }

      // ★ 关键：等待容器有正确尺寸再加载模型（容器未布局时 clientWidth ≈ 1）
      const container = containerRef.current
      await new Promise<void>((resolve) => {
        if (container.clientWidth > 10 && container.clientHeight > 10) {
          resolve()
          return
        }
        console.log('[Live2D5PetPage] ⏳ 等待容器布局...')
        const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.contentRect.width > 10 && entry.contentRect.height > 10) {
              observer.disconnect()
              resolve()
            }
          }
        })
        observer.observe(container)
      })
      console.log('[Live2D5PetPage] ✅ 容器尺寸:', container.clientWidth, 'x', container.clientHeight)

      try {
        console.log('[Live2D5PetPage] 📦 开始动态导入 cubism5-service...')
        setState('loading')
        const service = await loadCubism5Service()
        serviceRef.current = service
        console.log('[Live2D5PetPage] ✅ cubism5-service 导入成功')

        service.setStateCallback((s) => {
          console.log('[Live2D5PetPage] 🔄 状态变更:', s)
          if (!cancelled) {
            setState(s === 'idle' ? 'idle' : s === 'loading' ? 'loading' : s === 'loaded' ? 'loaded' : 'error')
          }
        })

        // ★ 新增：监听 shader 就绪事件
        service.setOnShaderReady(() => {
          if (!cancelled) {
            console.log('[Live2D5PetPage] ✅ shader 就绪，隐藏 loading')
            setShaderReady(true)
          }
        })

        const modelPath = new URL('./live2d/Ren/Ren.model3.json', window.location.href).href
        console.log('[Live2D5PetPage] 📦 开始加载模型, modelPath:', modelPath)

        await service.loadModel(
          {
            name: 'Ren',
            modelPath,
            scale: 0.85,
          },
          containerRef.current
        )

        console.log('[Live2D5PetPage] ✅ 模型加载完成')
        if (!cancelled) setState('loaded')
      } catch (err) {
        console.error('[Live2D5PetPage] ❌ 模型加载异常:', err)
        console.error('[Live2D5PetPage] ❌ 错误堆栈:', err instanceof Error ? err.stack : '无堆栈')
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败')
          setState('error')
        }
      }
    }

    load()

    return () => {
      cancelled = true
      serviceRef.current?.setOnShaderReady(null)
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
        serviceRef.current?.setOnShaderReady(null)
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
    setShaderReady(false)
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
        borderRadius: 12,
      }}
    >
      {/* DEBUG: 状态指示器 */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          fontSize: 11,
          color: state === 'error' ? '#ff6b6b' : state === 'loaded' ? '#51cf66' : '#ffd43b',
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.5)',
          padding: '2px 8px',
          borderRadius: 4,
          fontFamily: 'monospace',
          zIndex: 9999,
        }}
      >
        {state} {error ? `: ${error}` : ''}
      </div>

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

      {/* ★ 加载中 / shader 编译中 — 显示转圈动画 */}
      {(state === 'loading' || (state === 'loaded' && !shaderReady)) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 12,
            background: 'transparent',
            zIndex: 100,
          }}
        >
          {/* CSS 转圈动画 */}
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid rgba(167,139,250,0.2)',
              borderTopColor: '#a78bfa',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <div
            style={{
              color: 'rgba(167,139,250,0.8)',
              fontSize: 12,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {state === 'loading' ? '加载模型中...' : '编译 shader 中...'}
          </div>
          {/* 内联 keyframes */}
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
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
          <span>{React.createElement(Help, { size: 14, fill: '#f59e0b', theme: 'outline' })} WebGL 上下文丢失，等待恢复...</span>
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
