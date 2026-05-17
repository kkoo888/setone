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
  const [state, setState] = useState<Live2DPetState>({
    loaded: false, mouseTracking: true, clickInteraction: true,
    currentExpression: '', currentMotion: '',
    expressions: [], motions: [], messageText: '', lipSyncActive: false,
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; winX: number; winY: number }>({
    dragging: false, startX: 0, startY: 0, winX: 0, winY: 0,
  })

  // ========== 加载模型 ==========
  useEffect(() => {
    let cancelled = false

    const loadModel = async () => {
      try {
        // 等待 Cubism Core 加载完成（HTML 中已有 script 标签）
        for (let i = 0; i < 20; i++) {
          if ((window as any).Live2DCubismCore) break
          await new Promise(r => setTimeout(r, 250))
        }
        if (!(window as any).Live2DCubismCore) {
          throw new Error('Live2DCubismCore 未加载，请检查 public/lib/live2dcubismcore.min.js')
        }

        // 防止 live2d-easy-control 重复从 CDN 加载 Cubism Core
        // 如果 core 已存在，拦截 createElement('script') 阻止 CDN 请求
        const origCreate = document.createElement.bind(document)
        const coreReady = (window as any).Live2DCubismCore
        if (coreReady) {
          (document as any).createElement = function(tag: string) {
            const el = origCreate(tag)
            if (tag === 'script') {
              const origSetSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src')?.set
              if (origSetSrc) {
                Object.defineProperty(el, 'src', {
                  set(val: string) {
                    if (val.includes('live2dcubismcore')) {
                      // 跳过 CDN 加载，直接触发 onload
                      setTimeout(() => el.dispatchEvent(new Event('load')), 0)
                      return
                    }
                    origSetSrc.call(el, val)
                  },
                  get() { return el.getAttribute('src') ?? '' }
                })
              }
            }
            return el
          }
        }

        // 模型资源路径：
        // 库拼接方式: resourcesPath + modelDir + "/"
        // 目录结构:   public/live2d/Hiyori/Hiyori.model3.json
        // 所以: resourcesPath='/live2d/'  modelDir='Hiyori'
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
          debugLogEnable: false,
          debugTouchLogEnable: false,
        })

        // 恢复原始 createElement
        if (coreReady) {
          (document as any).createElement = origCreate
        }

        if (cancelled) return
        setReady(true)
        live2dEasyControl.setStateChangeCallback((s) => {
          if (!cancelled) setState(s)
        })
        setState(live2dEasyControl.getState())
      } catch (err) {
        if (!cancelled) {
          console.error('[Live2DPet] 模型加载失败:', err)
          setError(String(err))
        }
      }
    }

    loadModel()

    return () => {
      cancelled = true
      live2dEasyControl.setStateChangeCallback(null)
      live2dEasyControl.stop().catch(() => {})
    }
  }, [])

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
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'transparent',
        cursor: 'grab',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* 加载提示 */}
      {!ready && !error && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          color: 'rgba(255,255,255,0.7)', fontSize: 14, textShadow: '0 1px 6px rgba(0,0,0,0.8)',
          pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          🐱 加载中...
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          color: 'rgba(239,68,68,0.8)', fontSize: 12, textShadow: '0 1px 6px rgba(0,0,0,0.8)',
          textAlign: 'center', maxWidth: 200,
        }}>
          ❌ {error}
        </div>
      )}

      {/* 右键菜单 */}
      {showMenu && (
        <div style={{
          position: 'fixed', bottom: 60, right: 10,
          background: 'rgba(30, 30, 40, 0.95)', borderRadius: 12,
          padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)', zIndex: 100, minWidth: 180,
          maxHeight: '70vh', overflowY: 'auto',
        }}>
          {/* 表情 */}
          {state.expressions.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>😊 表情</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {state.expressions.map((exp) => (
                  <button key={exp} onClick={() => void handlePlayExpression(exp)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                      background: state.currentExpression === exp ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)',
                      color: '#fff', fontSize: 12, cursor: 'pointer',
                    }}>{exp || '默认'}</button>
                ))}
              </div>
            </>
          )}

          {/* 动作 */}
          {state.motions.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 2 }}>🏃 动作</div>
              {state.motions.map((m) => (
                <div key={m.group} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {m.names.map((name, i) => (
                    <button key={`${m.group}-${i}`} onClick={() => void handlePlayMotion(m.group, i)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, cursor: 'pointer',
                      }}>{m.group} {i}</button>
                  ))}
                </div>
              ))}
            </>
          )}

          {/* 功能开关 */}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 2 }}>⚙️ 功能</div>
          <button onClick={() => void handleToggleMouseTracking()}
            style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
              background: state.mouseTracking ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
              color: '#fff', fontSize: 12, cursor: 'pointer', textAlign: 'left',
            }}>
            {state.mouseTracking ? '👁️ 鼠标跟随：开' : '👁️ 鼠标跟随：关'}
          </button>
          <button onClick={() => void handleToggleClick()}
            style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
              background: state.clickInteraction ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
              color: '#fff', fontSize: 12, cursor: 'pointer', textAlign: 'left',
            }}>
            {state.clickInteraction ? '👆 点击交互：开' : '👆 点击交互：关'}
          </button>

          {/* 测试功能 */}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 2 }}>🧪 测试</div>
          <button onClick={() => void handleTestMessage()}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
            💬 显示对话气泡
          </button>
          <button onClick={() => void handleTestLipSync()}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
            🎤 嘴型同步测试
          </button>

          {/* 调整大小 */}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 2 }}>📐 调整大小</div>
          {[
            { label: '小 (200×260)', w: 200, h: 260 },
            { label: '中 (300×400)', w: 300, h: 400 },
            { label: '大 (400×530)', w: 400, h: 530 },
          ].map((p) => (
            <button key={p.label} onClick={() => {
              void window.electronAPI.invoke('live2d:set-size', { width: p.w, height: p.h })
              setShowMenu(false)
            }}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
              📐 {p.label}
            </button>
          ))}
        </div>
      )}

      {/* 操作提示 */}
      {ready && (
        <div style={{
          position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 12, fontSize: 10,
          color: 'rgba(255,255,255,0.35)', textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
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
