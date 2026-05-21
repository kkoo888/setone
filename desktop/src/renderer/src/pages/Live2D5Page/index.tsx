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

interface Live2D5Status {
  windowOpen: boolean
}

interface LoadedModel {
  name: string
  active: boolean
  expressions: string[]
  motionGroups: string[]
}

interface LiveStatus {
  sdkLoaded: boolean
  contextLost: boolean
  mouseTracking: boolean
  clickInteraction: boolean
  currentExpression: string
  currentMotion: string
  lipSyncActive: boolean
  bubbleText: string
}

const defaultLiveStatus: LiveStatus = {
  sdkLoaded: false,
  contextLost: false,
  mouseTracking: false,
  clickInteraction: false,
  currentExpression: '默认',
  currentMotion: '默认',
  lipSyncActive: false,
  bubbleText: '无',
}

export function Live2D5Page() {
  const [status, setStatus] = useState<Live2D5Status>({ windowOpen: false })
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('control')
  const [models, setModels] = useState<LoadedModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)

  // 控制面板新增状态
  const [liveStatus, setLiveStatus] = useState<LiveStatus>(defaultLiveStatus)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [reloading, setReloading] = useState(false)

  /** 查询状态 */
  const refreshStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.invoke('live2d5_status')
      if (result?.success) {
        setStatus(result.data)
      }
    } catch {}
  }, [])

  /** 查询已加载模型列表 */
  const refreshModels = useCallback(async () => {
    if (!status.windowOpen) return
    try {
      const result = await window.electronAPI.invoke('live2d5_get_models')
      if (result?.success && Array.isArray(result.data)) {
        setModels(result.data)
      }
    } catch {}
  }, [status.windowOpen])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 3000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  // 窗口打开后自动刷新模型列表
  useEffect(() => {
    if (status.windowOpen) {
      refreshModels()
      const interval = setInterval(refreshModels, 5000)
      return () => clearInterval(interval)
    } else {
      setModels([])
    }
  }, [status.windowOpen, refreshModels])

  /** 刷新控制面板全部数据 */
  const handleRefreshControl = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshStatus()
      const [statusRes, previewRes] = await Promise.all([
        window.electronAPI.invoke('live2d5_get_live_status'),
        window.electronAPI.invoke('live2d5_get_preview'),
      ])
      if (statusRes?.success && statusRes.data) {
        setLiveStatus(statusRes.data)
      }
      if (previewRes?.success) {
        setPreviewImage(previewRes.data)
      }
      // 同时刷新模型列表
      if (status.windowOpen) {
        const modelsRes = await window.electronAPI.invoke('live2d5_get_models')
        if (modelsRes?.success && Array.isArray(modelsRes.data)) {
          setModels(modelsRes.data)
        }
      }
    } catch {}
    setRefreshing(false)
  }, [refreshStatus, status.windowOpen])

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
      setLiveStatus(defaultLiveStatus)
      setPreviewImage(null)
    } catch (err) {
      console.error('关闭 Live2D 5 窗口失败:', err)
    }
    setLoading(false)
  }, [refreshStatus])

  /** 切换模型 */
  const handleSwitchModel = useCallback(async (name: string) => {
    setModelsLoading(true)
    try {
      await window.electronAPI.invoke('live2d5_switch_model', { name })
      await refreshModels()
    } catch (err) {
      console.error('切换模型失败:', err)
    }
    setModelsLoading(false)
  }, [refreshModels])

  /** 卸载模型 */
  const handleUnloadModel = useCallback(async (name: string) => {
    setModelsLoading(true)
    try {
      await window.electronAPI.invoke('live2d5_unload_model', { name })
      await refreshModels()
    } catch (err) {
      console.error('卸载模型失败:', err)
    }
    setModelsLoading(false)
  }, [refreshModels])

  /** 获取当前活跃模型 */
  const activeModel = models.find(m => m.active)

  /** 重新加载模型 */
  const handleReloadModel = useCallback(async () => {
    setReloading(true)
    try {
      await window.electronAPI.invoke('live2d5_reload_model')
      // 重新加载后自动刷新数据
      await handleRefreshControl()
    } catch (err) {
      console.error('重新加载模型失败:', err)
    }
    setReloading(false)
  }, [handleRefreshControl])

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
        {/* ====== 控制面板（左右分栏） ====== */}
        {activeTab === 'control' && (
          <div className="live2d5-control-panel">
            {/* 顶部操作栏 */}
            <div className="live2d5-actions">
              {status.windowOpen ? (
                <button className="btn btn-danger" onClick={handleClose} disabled={loading}>
                  {loading ? '关闭中...' : '关闭宠物窗口'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleOpen} disabled={loading}>
                  {loading ? '打开中...' : '打开宠物窗口'}
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={handleRefreshControl}
                disabled={refreshing || !status.windowOpen}
              >
                {refreshing ? '刷新中...' : '🔄 刷新'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleReloadModel}
                disabled={reloading || !status.windowOpen}
              >
                {reloading ? '重载中...' : '🔁 重载模型'}
              </button>
            </div>

            {/* 左右分栏 */}
            <div className="live2d5-control-layout">
              {/* 左侧：模型预览 */}
              <div className="live2d5-preview-side">
                <div className="live2d5-preview-card">
                  <div className="live2d5-preview-image">
                    {previewImage ? (
                      <img src={previewImage} alt="Live2D 预览" />
                    ) : (
                      <div className="live2d5-preview-placeholder">
                        {status.windowOpen ? '点击刷新获取预览' : '宠物窗口未启动'}
                      </div>
                    )}
                  </div>
                  <div className="live2d5-preview-info">
                    <span className="live2d5-preview-name">
                      {activeModel?.name ?? '无模型'}
                    </span>
                    <span className="live2d5-preview-version">
                      Live2D Cubism 5 模型
                    </span>
                    <span className="live2d5-preview-status">
                      <span className={`live2d5-status-dot ${status.windowOpen ? 'live2d5-status-dot--active' : ''}`} />
                      {status.windowOpen ? '模型就绪' : '未启动'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 右侧：功能卡片 */}
              <div className="live2d5-cards-side">
                {/* 桌面宠物开关 */}
                <div className="live2d5-feature-card">
                  <div className="live2d5-card-header">
                    <span className="live2d5-card-title">
                      <span className="live2d5-card-icon">🖥️</span>
                      桌面宠物
                    </span>
                    <button
                      className={`live2d5-toggle ${status.windowOpen ? 'live2d5-toggle--active' : ''}`}
                      onClick={status.windowOpen ? handleClose : handleOpen}
                      disabled={loading}
                      aria-label="切换桌面宠物"
                    />
                  </div>
                  <div className="live2d5-card-desc">
                    开启后将在桌面显示透明窗口的 Live2D 宠物
                  </div>
                </div>

                {/* 模型信息 */}
                <div className="live2d5-feature-card">
                  <div className="live2d5-card-header">
                    <span className="live2d5-card-title">
                      <span className="live2d5-card-icon">📊</span>
                      模型信息
                    </span>
                  </div>
                  <div className="live2d5-info-grid">
                    <div className="live2d5-info-item">
                      <span className="live2d5-info-label">名称</span>
                      <span className="live2d5-info-value">{activeModel?.name ?? '-'}</span>
                    </div>
                    <div className="live2d5-info-item">
                      <span className="live2d5-info-label">版本</span>
                      <span className="live2d5-info-value">Cubism 5</span>
                    </div>
                    <div className="live2d5-info-item">
                      <span className="live2d5-info-label">表情数</span>
                      <span className="live2d5-info-value">{activeModel?.expressions.length ?? 0}</span>
                    </div>
                    <div className="live2d5-info-item">
                      <span className="live2d5-info-label">动作数</span>
                      <span className="live2d5-info-value">
                        {activeModel?.motionGroups.reduce((sum, g) => sum + 1, 0) ?? 0}
                      </span>
                    </div>
                    <div className="live2d5-info-item">
                      <span className="live2d5-info-label">鼠标跟随</span>
                      <span className="live2d5-info-value">{liveStatus.mouseTracking ? '开启' : '关闭'}</span>
                    </div>
                  </div>
                </div>

                {/* 宠物实时状态 */}
                <div className="live2d5-feature-card">
                  <div className="live2d5-card-header">
                    <span className="live2d5-card-title">
                      <span className="live2d5-card-icon">🐾</span>
                      宠物实时状态
                    </span>
                  </div>
                  <div className="live2d5-status-grid">
                    <div className="live2d5-status-item">
                      <span className="live2d5-status-label">库加载</span>
                      <span className="live2d5-status-value">
                        <span className={`live2d5-status-dot ${liveStatus.sdkLoaded ? 'live2d5-status-dot--active' : 'live2d5-status-dot--off'}`} />
                        {liveStatus.sdkLoaded ? '已加载' : '等待中'}
                      </span>
                    </div>
                    <div className="live2d5-status-item">
                      <span className="live2d5-status-label">鼠标跟随</span>
                      <span className="live2d5-status-value">
                        <span className={`live2d5-status-dot ${liveStatus.mouseTracking ? 'live2d5-status-dot--active' : 'live2d5-status-dot--off'}`} />
                        {liveStatus.mouseTracking ? '开启' : '关闭'}
                      </span>
                    </div>
                    <div className="live2d5-status-item">
                      <span className="live2d5-status-label">点击交互</span>
                      <span className="live2d5-status-value">
                        <span className={`live2d5-status-dot ${liveStatus.clickInteraction ? 'live2d5-status-dot--active' : 'live2d5-status-dot--off'}`} />
                        {liveStatus.clickInteraction ? '开启' : '关闭'}
                      </span>
                    </div>
                    <div className="live2d5-status-item">
                      <span className="live2d5-status-label">当前表情</span>
                      <span className="live2d5-status-value">{liveStatus.currentExpression}</span>
                    </div>
                    <div className="live2d5-status-item">
                      <span className="live2d5-status-label">当前动作</span>
                      <span className="live2d5-status-value">{liveStatus.currentMotion}</span>
                    </div>
                    <div className="live2d5-status-item">
                      <span className="live2d5-status-label">嘴型同步</span>
                      <span className="live2d5-status-value">
                        <span className={`live2d5-status-dot ${liveStatus.lipSyncActive ? 'live2d5-status-dot--active' : 'live2d5-status-dot--off'}`} />
                        {liveStatus.lipSyncActive ? '开启' : '关闭'}
                      </span>
                    </div>
                    <div className="live2d5-status-item">
                      <span className="live2d5-status-label">对话气泡</span>
                      <span className="live2d5-status-value">{liveStatus.bubbleText}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== 模型管理 ====== */}
        {activeTab === 'models' && (
          <div className="live2d5-models-panel">
            {!status.windowOpen ? (
              <div className="live2d5-empty">
                <span className="live2d5-empty-icon" style={{ fontSize: 32, opacity: 0.4 }}>🎭</span>
                <p>请先打开宠物窗口</p>
              </div>
            ) : models.length === 0 ? (
              <div className="live2d5-empty">
                <span className="live2d5-empty-icon" style={{ fontSize: 32, opacity: 0.4 }}>📦</span>
                <p>暂无已加载的模型</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--spacing-xs)' }}>
                  已加载 {models.length} 个模型，点击切换，卸载可释放 GPU 内存
                </div>
                {models.map(m => (
                  <div
                    key={m.name}
                    className="live2d5-status-card"
                    style={{
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 'var(--spacing-sm)',
                      borderColor: m.active ? 'var(--color-primary)' : undefined,
                      opacity: modelsLoading ? 0.6 : 1,
                      pointerEvents: modelsLoading ? 'none' : 'auto',
                    }}
                  >
                    {/* 模型名称 + 状态 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                        <span className={`live2d5-status-dot ${m.active ? 'live2d5-status-dot--active' : ''}`} />
                        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {m.name}
                        </span>
                        {m.active && (
                          <span style={{
                            fontSize: 'var(--font-size-2xs)',
                            background: 'var(--color-primary)',
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                          }}>
                            当前
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                        {!m.active && (
                          <button
                            className="btn btn-primary"
                            style={{ padding: '4px 12px', fontSize: 'var(--font-size-xs)' }}
                            onClick={() => handleSwitchModel(m.name)}
                          >
                            切换
                          </button>
                        )}
                        {!m.active && (
                          <button
                            className="btn btn-danger"
                            style={{ padding: '4px 12px', fontSize: 'var(--font-size-xs)' }}
                            onClick={() => handleUnloadModel(m.name)}
                          >
                            卸载
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 模型详情 */}
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                      表情: {m.expressions.length > 0 ? m.expressions.join(', ') : '无'}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                      动作组: {m.motionGroups.length > 0 ? m.motionGroups.join(', ') : '无'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ====== 设置 ====== */}
        {activeTab === 'settings' && (
          <div className="live2d5-settings-panel">
            <div className="live2d5-info">
              <h4>渲染设置</h4>
              <ul>
                <li>WebGL 上下文: {status.windowOpen ? '已创建' : '未创建'}</li>
                <li>渲染模式: 原生 WebGL 2.0（自动降级到 1.0）</li>
                <li>抗锯齿: 开启</li>
                <li>透明背景: 开启</li>
              </ul>
            </div>

            <div className="live2d5-info" style={{ marginTop: 'var(--spacing-md)' }}>
              <h4>效果设置</h4>
              <ul>
                <li>物理演算: 自动（从 model3.json 加载）</li>
                <li>自动眨眼: 开启</li>
                <li>呼吸效果: 开启</li>
                <li>鼠标注视: 开启（6 参数追踪）</li>
                <li>口型同步: 开启（WAV 音频驱动）</li>
                <li>Pose 切换: 自动（从 model3.json 加载）</li>
              </ul>
            </div>

            <div className="live2d5-info" style={{ marginTop: 'var(--spacing-md)' }}>
              <h4>交互设置</h4>
              <ul>
                <li>点击头部: 随机切换表情</li>
                <li>点击身体: 随机播放动作</li>
                <li>拖拽: 模型注视跟随</li>
                <li>窗口拖拽: 支持（无边框窗口）</li>
              </ul>
            </div>

            <div className="live2d5-info" style={{ marginTop: 'var(--spacing-md)' }}>
              <h4>模型资源</h4>
              <ul>
                <li>Core SDK: live2dcubismcore5.min.js</li>
                <li>Framework: 内置完整源码（modules/live2d-5/lib/）</li>
                <li>Shader: 内置 WebGL 着色器</li>
                <li>默认模型: Hiyori（含 physics/pose/motions）</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Live2D5Page
