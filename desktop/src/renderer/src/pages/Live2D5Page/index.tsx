/**
 * Live2D Cubism 5 管理页面
 * 使用 ModuleHeader 统一头部
 *
 * 所有 IPC 调用统一使用能力工具名（live2d5_open 等），
 * 不使用内部 IPC（live2d5:xxx）。
 */
import React, { useState, useCallback, useEffect } from 'react'
import { FolderOpen, SettingOne } from '../../utils/statusMessages'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'

const folderI = React.createElement(FolderOpen, { size: 14, fill: 'currentColor', theme: 'outline' })
const settingI = React.createElement(SettingOne, { size: 14, fill: 'currentColor', theme: 'outline' })
const folderBigI = React.createElement(FolderOpen, { size: 32, fill: '#9ca3af', theme: 'outline' })
const settingBigI = React.createElement(SettingOne, { size: 32, fill: '#9ca3af', theme: 'outline' })

interface Live2D5Status {
  windowOpen: boolean
}

export function Live2D5Page() {
  const [status, setStatus] = useState<Live2D5Status>({ windowOpen: false })
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('control')

  /** 查询状态 */
  const refreshStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.invoke('live2d5_status')
      if (result?.success) {
        setStatus(result.data)
      }
    } catch {}
  }, [])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 3000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  /** 打开宠物窗口 */
  const handleOpen = useCallback(async () => {
    setLoading(true)
    try {
      await window.electronAPI.invoke('live2d5_open')
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
      await window.electronAPI.invoke('live2d5_close')
      await refreshStatus()
    } catch (err) {
      console.error('关闭 Live2D 5 窗口失败:', err)
    }
    setLoading(false)
  }, [refreshStatus])

  return (
    <div className="mod-page">
      <ModuleHeader
        icon="🎭"
        title="Live2D Cubism 5"
        tabs={[
          { key: 'control', label: '🎮 控制面板' },
          { key: 'models', label: <>{folderI} 模型管理</> },
          { key: 'settings', label: <>{settingI} 设置</> },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="live2d5-content">
        {activeTab === 'control' && (
          <div className="live2d5-control-panel">
            {/* 状态卡片 */}
            <div className="live2d5-status-card">
              <div className="live2d5-status-indicator">
                <span
                  className={`live2d5-status-dot ${status.windowOpen ? 'live2d5-status-dot--active' : ''}`}
                />
                <span className="live2d5-status-text">
                  {status.windowOpen ? '运行中' : '未启动'}
                </span>
              </div>
              <span className="live2d5-version">Cubism 5 SDK R5 · 原生 WebGL</span>
            </div>

            {/* 操作按钮 */}
            <div className="live2d5-actions">
              {status.windowOpen ? (
                <button
                  className="btn btn-danger"
                  onClick={handleClose}
                  disabled={loading}
                >
                  {loading ? '关闭中...' : '关闭宠物窗口'}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleOpen}
                  disabled={loading}
                >
                  {loading ? '打开中...' : '打开宠物窗口'}
                </button>
              )}
            </div>

            {/* 说明 */}
            <div className="live2d5-info">
              <h4>关于 Live2D Cubism 5</h4>
              <ul>
                <li>基于 Cubism 5 SDK for Web R5</li>
                <li>原生 WebGL 渲染，不依赖 pixi.js</li>
                <li>独立窗口运行，与旧版 Live2D 完全隔离</li>
                <li>支持表情切换、动作播放、鼠标跟随</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'models' && (
          <div className="live2d5-models-panel">
            <div className="live2d5-empty">
              <span className="live2d5-empty-icon">{folderBigI}</span>
              <p>模型管理功能开发中...</p>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="live2d5-settings-panel">
            <div className="live2d5-empty">
              <span className="live2d5-empty-icon">{settingBigI}</span>
              <p>设置功能开发中...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Live2D5Page
