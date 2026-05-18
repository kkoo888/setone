/**
 * Live2D Cubism 5 控制面板组件
 * 嵌入主窗口，控制独立宠物窗口
 * 使用 ModuleHeader 统一头部
 */
import React, { useState, useCallback, useEffect } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'

interface Live2D5Status {
  windowOpen: boolean
}

export const Live2D5Controls: React.FC = () => {
  const [status, setStatus] = useState<Live2D5Status>({ windowOpen: false })
  const [loading, setLoading] = useState(false)

  /** 查询状态 */
  const refreshStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.invoke('live2d5:get-status')
      setStatus(result)
    } catch (err) {
      console.error('[Live2D5] 查询状态失败:', err)
    }
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  /** 打开宠物窗口 */
  const handleOpen = useCallback(async () => {
    setLoading(true)
    try {
      await window.electronAPI.invoke('live2d5:create-window')
      await refreshStatus()
    } catch (err) {
      console.error('打开 Live2D 5 窗口失败:', err)
    }
    setLoading(false)
  }, [refreshStatus])

  /** 关闭宠物窗口 */
  const handleClose = useCallback(async () => {
    setLoading(true)
    try {
      await window.electronAPI.invoke('live2d5:close-window')
      await refreshStatus()
    } catch (err) {
      console.error('关闭 Live2D 5 窗口失败:', err)
    }
    setLoading(false)
  }, [refreshStatus])

  return (
    <div className="mod-page">
      <ModuleHeader icon="🎭" title="Live2D Cubism 5" />

      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {status.windowOpen ? (
            <button
              onClick={handleClose}
              disabled={loading}
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                border: '1px solid rgba(220,38,38,0.3)',
                background: 'rgba(220,38,38,0.1)',
                color: '#dc2626',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {loading ? '关闭中...' : '关闭宠物'}
            </button>
          ) : (
            <button
              onClick={handleOpen}
              disabled={loading}
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                border: '1px solid rgba(34,197,94,0.3)',
                background: 'rgba(34,197,94,0.1)',
                color: '#22c55e',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {loading ? '打开中...' : '打开宠物'}
            </button>
          )}

          <span
            style={{
              fontSize: 12,
              color: status.windowOpen ? '#22c55e' : '#6b7280',
            }}
          >
            {status.windowOpen ? '● 运行中' : '○ 未启动'}
          </span>
        </div>

        <p style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
          Cubism 5 SDK R5 · 原生 WebGL 渲染 · 独立窗口运行
        </p>
      </div>
    </div>
  )
}

export default Live2D5Controls
