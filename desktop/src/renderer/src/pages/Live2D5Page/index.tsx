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

export function Live2D5Page() {
  const [status, setStatus] = useState<Live2D5Status>({ windowOpen: false })
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('control')
  const [models, setModels] = useState<LoadedModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)

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
        {/* ====== 控制面板 ====== */}
        {activeTab === 'control' && (
          <div className="live2d5-control-panel">
            {/* 状态卡片 */}
            <div className="live2d5-status-card">
              <div className="live2d5-status-indicator">
                <span className={`live2d5-status-dot ${status.windowOpen ? 'live2d5-status-dot--active' : ''}`} />
                <span className="live2d5-status-text">
                  {status.windowOpen ? '运行中' : '未启动'}
                </span>
              </div>
              <span className="live2d5-version">Cubism 5 SDK R5 · 原生 WebGL</span>
            </div>

            {/* 操作按钮 */}
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
            </div>

            {/* 当前模型信息 */}
            {status.windowOpen && models.length > 0 && (
              <div className="live2d5-info">
                <h4>当前模型</h4>
                {models.filter(m => m.active).map(m => (
                  <div key={m.name} style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                      表情: {m.expressions.length} 个 · 动作组: {m.motionGroups.join(', ') || '无'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 说明 */}
            <div className="live2d5-info" style={{ marginTop: 'var(--spacing-md)' }}>
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
