/**
 * Live2D Cubism 5 桌面宠物页面
 * 在独立 renderer 进程中运行
 * 使用 Cubism 5 原生渲染，不依赖 pixi.js
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { cubism5Service, type Cubism5ModelState } from '../services/cubism5-service'

const Live2D5PetPage: React.FC = () => {
  const [state, setState] = useState<Cubism5ModelState>('idle')
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 加载模型
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!containerRef.current) return

      try {
        cubism5Service.setStateCallback((s) => {
          if (!cancelled) setState(s)
        })

        await cubism5Service.loadModel(
          {
            name: 'Hiyori',
            modelPath: new URL('/live2d/Hiyori/Hiyori.model3.json', window.location.origin).href,
            scale: 0.15,
          },
          containerRef.current
        )
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败')
        }
      }
    }

    load()

    return () => {
      cancelled = true
      cubism5Service.setStateCallback(null)
      cubism5Service.destroy()
    }
  }, [])

  // 拖拽支持
  useEffect(() => {
    const handleMouseDown = () => {
      window.electronAPI?.invoke('live2d5_start_drag')
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
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

      {/* 错误提示 */}
      {state === 'error' && error && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(220,38,38,0.9)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {error}
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
