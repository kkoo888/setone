/**
 * Live2D 管理页面
 * 展示当前 Live2D 形象预览、桌面宠物开关
 */
import React, { useState, useCallback, useEffect } from 'react'
import { Live2DProvider, useLive2DContext } from '../components/live2d/Live2DContext'
import { Live2DCanvas } from '../components/live2d/Live2DCanvas'
import { Live2DStatus } from '../components/live2d/types/live2d'

/** Live2D 页面内部内容（必须在 Live2DProvider 内部使用） */
function Live2DPageContent() {
  const { state, reset } = useLive2DContext()
  const [petEnabled, setPetEnabled] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  /** 检查宠物窗口是否已打开 */
  useEffect(() => {
    window.electronAPI
      .invoke('config:get', { key: 'appSettings.live2dPetEnabled' })
      .then((val) => {
        if (typeof val === 'boolean') setPetEnabled(val)
      })
      .catch(() => {})
  }, [])

  /** 切换桌面宠物 */
  const handleTogglePet = useCallback(
    async (enabled: boolean) => {
      setPetEnabled(enabled)
      try {
        if (enabled) {
          await window.electronAPI.invoke('live2d:create-window')
        } else {
          await window.electronAPI.invoke('live2d:close-window')
        }
        await window.electronAPI.invoke('config:set', {
          key: 'appSettings.live2dPetEnabled',
          value: enabled,
        })
      } catch (err) {
        console.error('切换桌面宠物失败:', err)
        setPetEnabled(!enabled)
      }
    },
    []
  )

  const isLoaded = state.status === Live2DStatus.LOADED
  const isError = state.status === Live2DStatus.ERROR

  /** 重试加载 */
  const handleRetry = useCallback(() => {
    reset()
    setRetryKey((k) => k + 1)
  }, [reset])

  return (
    <div className="live2d-page">
      {/* 顶部标题 */}
      <div className="live2d-page-header">
        <div className="live2d-page-title-group">
          <h1 className="live2d-page-title">Live2D 桌面宠物</h1>
          <p className="live2d-page-subtitle">
            可爱的 Live2D 伙伴，陪伴你的每一天 ✨
          </p>
        </div>
      </div>

      {/* 主体区域：左右布局 */}
      <div className="live2d-page-body">
        {/* 左侧：形象预览 */}
        <div className="live2d-preview-section">
          <div className="live2d-preview-card">
            <div className="live2d-preview-image">
              <Live2DCanvas
                key={retryKey}
                width="100%"
                height={400}
                onReady={() => console.log('[Live2DPage] 模型就绪')}
                onError={(msg) => console.error('[Live2DPage] 模型加载失败:', msg)}
              />
            </div>
            <div className="live2d-preview-info">
              <h3 className="live2d-model-name">Hiyori</h3>
              <p className="live2d-model-desc">Live2D Cubism 4 模型</p>
              <div className="live2d-model-status">
                <span
                  className={`status-dot ${
                    isLoaded ? 'active' : state.status === Live2DStatus.LOADING ? 'loading' : isError ? 'error' : ''
                  }`}
                />
                <span className="status-text">
                  {isLoaded ? '模型就绪' : state.status === Live2DStatus.LOADING ? '加载中...' : isError ? '加载失败' : '待机'}
                </span>
              </div>
              {isError && state.errorMessage && (
                <p className="live2d-error-detail" style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>
                  ❌ {state.errorMessage}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：控制面板 */}
        <div className="live2d-control-section">
          {/* 桌面宠物开关 */}
          <div className="live2d-toggle-card">
            <div className="live2d-toggle-info">
              <h3 className="live2d-toggle-title">🖥️ 桌面宠物</h3>
              <p className="live2d-toggle-desc">
                开启后将在桌面显示透明窗口的 Live2D 宠物
              </p>
            </div>
            <label className="live2d-switch">
              <input
                type="checkbox"
                checked={petEnabled}
                onChange={(e) => void handleTogglePet(e.target.checked)}
              />
              <span className="live2d-switch-slider" />
            </label>
          </div>

          {/* 提示信息 */}
          {isError && (
            <div className="live2d-hint-card">
              <p className="live2d-hint-title">💡 解决方案</p>
              <ol className="live2d-hint-list">
                <li>确保已安装依赖：<code>npm install pixi.js pixi-live2d-display</code></li>
                <li>确保 <code>public/lib/live2dcubismcore.min.js</code> 存在</li>
                <li>重启应用后重试</li>
              </ol>
              <button
                className="btn btn-primary"
                style={{ marginTop: 12 }}
                onClick={handleRetry}
              >
                🔄 重新加载
              </button>
            </div>
          )}

          {/* 模型信息 */}
          {isLoaded && (
            <div className="live2d-info-card">
              <h3>📊 模型信息</h3>
              <div className="live2d-info-grid">
                <div className="live2d-info-item">
                  <span className="live2d-info-label">名称</span>
                  <span className="live2d-info-value">Hiyori</span>
                </div>
                <div className="live2d-info-item">
                  <span className="live2d-info-label">版本</span>
                  <span className="live2d-info-value">Cubism 4</span>
                </div>
                <div className="live2d-info-item">
                  <span className="live2d-info-label">表情数</span>
                  <span className="live2d-info-value">{state.expressions.length}</span>
                </div>
                <div className="live2d-info-item">
                  <span className="live2d-info-label">动作数</span>
                  <span className="live2d-info-value">{state.motions.length}</span>
                </div>
                <div className="live2d-info-item">
                  <span className="live2d-info-label">鼠标跟随</span>
                  <span className="live2d-info-value">{state.mouseTrackingEnabled ? '开启' : '关闭'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Live2D 管理页面（带 Provider 包裹）
 * 将 Live2DProvider 限制在页面级别，避免错误时影响全局布局
 */
export function Live2DPage() {
  return (
    <Live2DProvider>
      <Live2DPageContent />
    </Live2DProvider>
  )
}

export default Live2DPage
