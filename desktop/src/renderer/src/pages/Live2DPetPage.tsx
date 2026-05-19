/**
 * Live2D 桌面宠物页面
 * 使用 live2d-easy-control 库
 * 支持：鼠标跟随、点击交互、拖拽移动、滚轮缩放、右键菜单
 */
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { live2dEasyControl, type Live2DPetState } from '../services/Live2DEasyControlService'

const Live2DPetPage: React.FC = () => {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [state, setState] = useState<Live2DPetState>({
    loaded: false, mouseTracking: true, clickInteraction: true,
    currentExpression: '', currentMotion: '',
    expressions: [], motions: [], messageText: '', lipSyncActive: false,
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; winX: number; winY: number }>({
    dragging: false, startX: 0, startY: 0, winX: 0, winY: 0,
  })

  /** 手动重试 */
  const handleRetry = useCallback(() => {
    setError(null)
    setReady(false)
    live2dEasyControl.stop().catch(() => {})
    setRetryKey((k) => k + 1)
  }, [])

  // ========== 加载模型（带自动重试） ==========
  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const loadModel = async (attempt: number = 1) => {
      const MAX_RETRIES = 2
      try {
        console.log(`[Live2DPet] 🚀 开始加载 (尝试 ${attempt}/${MAX_RETRIES + 1})...`)

        // 等待 Cubism Core 加载完成
        for (let i = 0; i < 40; i++) {
          if ((window as any).Live2DCubismCore) break
          await new Promise(r => setTimeout(r, 250))
        }
        const core = (window as any).Live2DCubismCore
        if (!core) {
          throw new Error('Live2DCubismCore 未加载')
        }

        // ⚡ 兼容性修复：补全 Memory 对象（部分 Core 版本缺少此 API）
        if (!core.Memory) {
          console.log('[Live2DPet] ⚠️ Cubism Core 缺少 Memory，注入兼容层')
          core.Memory = {
            initializeAmountOfMemory: (size: number) => {
              console.log('[Live2DPet] Memory.initializeAmountOfMemory 兼容层:', size)
            },
          }
        }
        console.log('[Live2DPet] ✅ Cubism Core 已就绪')

        await live2dEasyControl.load({
          modelDir: 'Hiyori',
          resourcesPath: '/live2d/',
          canvasSize: 'auto',
          canvasWidth: '100vw',
          canvasHeight: '100vh',
          canvasPosition: 'right',
          hitAreaNameHead: 'Head',
          hitAreaNameBody: 'Body',
          motionGroupIdle: 'Idle',
          motionGroupTapBody: 'TapBody',
          expressionNames: { 'default': '' },
          motionNames: {
            'default': { group: 'Idle', no: -1, priority: 0 },
            'idle1': { group: 'Idle', no: 0, priority: 1 },
            'idle2': { group: 'Idle', no: 1, priority: 1 },
            'tap': { group: 'TapBody', no: 0, priority: 2 },
          },
          debugLogEnable: true,
          debugTouchLogEnable: false,
        })

        if (cancelled) return
        console.log('[Live2DPet] ✅ 模型加载成功！')
        setReady(true)
        live2dEasyControl.setStateChangeCallback((s) => {
          if (!cancelled) setState(s)
        })
        setState(live2dEasyControl.getState())
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[Live2DPet] ❌ 加载失败 (尝试 ${attempt}):`, message)

        // 自动重试
        if (attempt <= MAX_RETRIES) {
          console.log(`[Live2DPet] ⏳ 1.5秒后自动重试...`)
          retryTimer = setTimeout(() => {
            if (!cancelled) loadModel(attempt + 1)
          }, 1500)
        } else {
          setError(`加载失败: ${message}`)
        }
      }
    }

    loadModel()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      live2dEasyControl.setStateChangeCallback(null)
      live2dEasyControl.stop().catch(() => {})
    }
  }, [retryKey])

  // ========== 窗口拖拽（原生 DOM 事件） ==========
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onMouseDown = async (e: MouseEvent) => {
      if (e.button !== 0 || showMenu) return
      dragRef.current.dragging = true
      dragRef.current.startX = e.screenX
      dragRef.current.startY = e.screenY
      try {
        const bounds = await window.electronAPI.invoke('live2d:get-bounds')
        if (bounds) {
          dragRef.current.winX = bounds.x
          dragRef.current.winY = bounds.y
        }
      } catch { /* ignore */ }
    }

    const onMouseMove = async (e: MouseEvent) => {
      // 模型朝向跟随
      try {
        await live2dEasyControl.setAngle(e.clientX, e.clientY, 0.3)
      } catch { /* ignore */ }

      // 窗口拖拽
      if (!dragRef.current.dragging) return
      const dx = e.screenX - dragRef.current.startX
      const dy = e.screenY - dragRef.current.startY
      try {
        await window.electronAPI.invoke('live2d:set-position', {
          x: dragRef.current.winX + dx,
          y: dragRef.current.winY + dy,
        })
      } catch { /* ignore */ }
    }

    const onMouseUp = () => {
      dragRef.current.dragging = false
      // 恢复朝向
      live2dEasyControl.resetAngle().catch(() => {})
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
      setShowMenu(v => !v)
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
  }, [showMenu])

  // ========== 快捷操作 ==========
  const handlePlayExpression = useCallback(async (name: string) => {
    await live2dEasyControl.playExpression(name)
    setShowMenu(false)
  }, [])

  const handlePlayMotion = useCallback(async (group: string, no: number) => {
    await live2dEasyControl.playMotion(group, no, 2)
    setShowMenu(false)
  }, [])

  const handleToggleMouseTracking = useCallback(async () => {
    if (state.mouseTracking) {
      await live2dEasyControl.disableMouseInteraction()
    } else {
      await live2dEasyControl.enableMouseTracking()
    }
  }, [state.mouseTracking])

  const handleToggleClick = useCallback(async () => {
    if (state.clickInteraction) {
      await live2dEasyControl.disableClickInteraction()
    } else {
      await live2dEasyControl.enableClickInteraction()
    }
  }, [state.clickInteraction])

  const handleTestMessage = useCallback(async () => {
    await live2dEasyControl.setMessage('主人好~ 我是你的桌面宠物！🐱', 3000)
  }, [])

  const handleTestLipSync = useCallback(() => {
    live2dEasyControl.startLipSync(80)
    setTimeout(() => live2dEasyControl.stopLipSync(), 3000)
  }, [])

  return (
    <div
      ref={containerRef}
      className='pet-container'
    >
      {/* 加载提示 */}
      {!ready && !error && (
        <div className='pet-overlay-center'>
          <span className='pet-loading-text'>🐱 加载中...</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className='pet-overlay-center'>
          <span className='pet-error-text'>❌ {error}</span>
          <button onClick={handleRetry} className='pet-retry-btn'>🔄 重新加载</button>
        </div>
      )}

      {/* 右键菜单 */}
      {showMenu && (
        <div className='pet-context-menu'>
          {/* 表情 */}
          {state.expressions.length > 0 && (
            <>
              <div className='pet-section-title'>😊 表情</div>
              <div className='pet-tag-grid'>
                {state.expressions.map((exp) => (
                  <button key={exp} onClick={() => void handlePlayExpression(exp)}
                    className={`pet-tag-btn ${state.currentExpression === exp ? 'active' : ''}`}>{exp || '默认'}</button>
                ))}
              </div>
            </>
          )}

          {/* 动作 */}
          {state.motions.length > 0 && (
            <>
              <div className='pet-section-title'>🏃 动作</div>
              {state.motions.map((m) => (
                <div key={m.group} className='pet-tag-grid'>
                  {m.names.map((name, i) => (
                    <button key={`${m.group}-${i}`} onClick={() => void handlePlayMotion(m.group, i)}
                      className='pet-tag-btn'>{m.group} {i}</button>
                  ))}
                </div>
              ))}
            </>
          )}

          {/* 功能开关 */}
          <div className='pet-section-title'>⚙️ 功能</div>
          <button onClick={() => void handleToggleMouseTracking()}
            className={`pet-btn toggle-on ${state.mouseTracking ? '' : ''}`}>
            {state.mouseTracking ? '👁️ 鼠标跟随：开' : '👁️ 鼠标跟随：关'}
          </button>
          <button onClick={() => void handleToggleClick()}
            className={`pet-btn ${state.clickInteraction ? 'toggle-on' : ''}`}>
            {state.clickInteraction ? '👆 点击交互：开' : '👆 点击交互：关'}
          </button>

          {/* 测试功能 */}
          <div className='pet-section-title'>🧪 测试</div>
          <button onClick={() => void handleTestMessage()} className='pet-btn'>
            💬 显示对话气泡
          </button>
          <button onClick={() => void handleTestLipSync()} className='pet-btn'>
            🎤 嘴型同步测试
          </button>

          {/* 调整大小 */}
          <div className='pet-section-title'>📐 调整大小</div>
          {[
            { label: '小 (200×260)', w: 200, h: 260 },
            { label: '中 (300×400)', w: 300, h: 400 },
            { label: '大 (400×530)', w: 400, h: 530 },
          ].map((p) => (
            <button key={p.label} onClick={() => {
              void window.electronAPI.invoke('live2d:set-size', { width: p.w, height: p.h })
              setShowMenu(false)
            }} className='pet-btn'>
              📐 {p.label}
            </button>
          ))}
        </div>
      )}

      {/* 操作提示 */}
      {ready && (
        <div className='pet-hint-bar'>
          <span>🖱️ 拖拽移动</span>
          <span>⚙️ 滚轮缩放</span>
          <span>📌 右键菜单</span>
          <span>👆 点击互动</span>
        </div>
      )}
    </div>
  )
}

export default Live2DPetPage
