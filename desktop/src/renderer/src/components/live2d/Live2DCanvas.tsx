import React, { useRef, useEffect, useCallback } from 'react'
import { Live2DManager } from './Live2DManager'
import { useLive2DContext } from './Live2DContext'
import { useMouseTracking } from './hooks/useMouseTracking'
import { Live2DStatus } from './types/live2d'

interface Live2DCanvasProps {
  width?: number | string
  height?: number | string
  className?: string
  onReady?: () => void
  onError?: (error: string) => void
}

/** 默认模型配置 */
const DEFAULT_MODEL_CONFIG = {
  name: 'Hiyori',
  // Vite 会通过 import.meta.url 正确处理 public/ 下的静态资源
  modelPath: new URL('/live2d/hiyori/Hiyori.model3.json', import.meta.url).href,
  scale: 0.08,
  offsetX: 0.5,
  offsetY: 0.5,
}

/**
 * Live2D 渲染画布组件
 * 管理 pixi.js Application 的创建、模型加载和生命周期
 */
export const Live2DCanvas: React.FC<Live2DCanvasProps> = ({
  width = '100%',
  height = 400,
  className = '',
  onReady,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { state, loadModel } = useLive2DContext()
  const managerRef = useRef<Live2DManager>(Live2DManager.getInstance())
  const initializedRef = useRef(false)

  /** 初始化模型加载 */
  const initModel = useCallback(async () => {
    const container = containerRef.current
    if (!container || initializedRef.current) return

    initializedRef.current = true

    try {
      console.log('[Live2DCanvas] 🚀 开始初始化...')
      console.log('[Live2DCanvas] 模型路径:', DEFAULT_MODEL_CONFIG.modelPath)
      console.log('[Live2DCanvas] 容器尺寸:', container.clientWidth, 'x', container.clientHeight)

      // 只通过 context 的 loadModel 加载（传入容器用于挂载 canvas）
      await loadModel(DEFAULT_MODEL_CONFIG, container)

      console.log('[Live2DCanvas] 🎉 初始化完成')
    } catch (err) {
      const message = err instanceof Error ? err.message : '初始化失败'
      console.error('[Live2DCanvas] ❌ 初始化失败:', message)
      onError?.(message)
    }
    // 注意：onError 不加入依赖，避免父组件重渲染导致 effect 重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    initModel()

    // 不在 cleanup 中销毁单例 manager，避免竞态条件：
    // 父组件重渲染 → initModel 引用变化 → cleanup 销毁正在工作的 PIXI App
    // 单例 manager 的生命周期由应用整体管理，不由单个组件控制
  }, [initModel])

  /** 监听状态变化触发回调 */
  useEffect(() => {
    if (state.status === Live2DStatus.LOADED) {
      onReady?.()
    } else if (state.status === Live2DStatus.ERROR) {
      onError?.(state.errorMessage ?? '未知错误')
    }
  }, [state.status, state.errorMessage, onReady, onError])

  /** 监听窗口尺寸变化 */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect
        if (w > 0 && h > 0) {
          managerRef.current.resize(w, h)
        }
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  /** 鼠标追踪 - 始终在模型加载后启用 */
  useMouseTracking(containerRef, {
    enabled: state.status === Live2DStatus.LOADED,
  })

  return (
    <div
      ref={containerRef}
      className={`live2d-canvas ${className}`}
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'transparent',
        background: 'transparent',
      }}
      data-status={state.status}
    >
      {state.status === Live2DStatus.LOADING && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          zIndex: 1,
        }}>
          <div style={{
            width: 32, height: 32,
            border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: '#a78bfa',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: 13, color: '#a78bfa' }}>加载 Live2D 模型中...</span>
        </div>
      )}
    </div>
  )
}

export default Live2DCanvas
