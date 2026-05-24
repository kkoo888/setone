/**
 * Live2D Cubism 5 桌面宠物页面
 * 在独立 renderer 进程中运行
 * 使用 Cubism 5 原生渲染，不依赖 pixi.js
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { cubism5Service, type Cubism5ModelState } from '../services/cubism5-service'

// ★ 新增：调试模式配置
const DEBUG_HIT_AREAS = false // 设为 true 可显示 hitTest 区域

const Live2D5PetPage: React.FC = () => {
  const [state, setState] = useState<Cubism5ModelState>('idle')
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 加载已应用的模型
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!containerRef.current) return

      try {
        cubism5Service.setStateCallback((s) => {
          if (!cancelled) setState(s)
        })

        // 从后端读取已应用的模型
        let modelPath = './live2d/Hiyori/Hiyori.model3.json'  // fallback
        let modelName = 'Hiyori'
        try {
          const result = await window.electronAPI.invoke('live2d5_get_applied_model')
          if (result?.success && result.data) {
            modelPath = result.data.path
            modelName = result.data.name
          }
        } catch {}

        // 相对路径用 new URL 解析，绝对路径走 local-file:// 自定义协议
        const resolvedPath = modelPath.startsWith('./') || modelPath.startsWith('../')
          ? new URL(modelPath, document.baseURI).href
          : `local-file://${modelPath}`

        await cubism5Service.loadModel(
          { name: modelName, modelPath: resolvedPath, scale: 0.6 },
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
        background: 'rgba(30, 30, 50, 0.85)', // DEBUG: 临时背景色，验证窗口渲染
        position: 'relative',
        borderRadius: 12,
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
            pointerEvents: 'none',  // ★ 修复：不遮挡底层交互
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

      {/* DEBUG: 状态指示器 */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          fontSize: 11,
          color: state === 'error' ? '#ff6b6b' : state === 'ready' ? '#51cf66' : '#ffd43b',
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.5)',
          padding: '2px 8px',
          borderRadius: 4,
          fontFamily: 'monospace',
        }}
      >
        {state} {error ? `: ${error}` : ''}
      </div>

      {/* Cubism 5 标识 */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          fontSize: 10,
          color: 'rgba(255,255,255,0.4)',
          pointerEvents: 'none',
        }}
      >
        C5
      </div>

      {/* ★ 新增：hitTest 区域可视化调试 */}
      {DEBUG_HIT_AREAS && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          {/* 示例：头部区域（需要根据实际模型调整） */}
          <div
            style={{
              position: 'absolute',
              top: '15%',
              left: '30%',
              width: '40%',
              height: '25%',
              border: '2px dashed rgba(255, 0, 0, 0.7)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: 'red', fontSize: 12, background: 'rgba(0,0,0,0.5)', padding: '2px 6px' }}>Head</span>
          </div>
          {/* 示例：身体区域 */}
          <div
            style={{
              position: 'absolute',
              top: '45%',
              left: '25%',
              width: '50%',
              height: '40%',
              border: '2px dashed rgba(0, 255, 0, 0.7)',
              borderRadius: '10%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: 'green', fontSize: 12, background: 'rgba(0,0,0,0.5)', padding: '2px 6px' }}>Body</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default Live2D5PetPage
