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
import { ModuleModal } from '../../components/common/module/ModuleList'

const folderI = React.createElement(FolderOpen, { size: 14, fill: 'currentColor', theme: 'outline' })
const settingI = React.createElement(SettingOne, { size: 14, fill: 'currentColor', theme: 'outline' })

interface Live2D5Status {
  windowOpen: boolean
}

interface ModelInfo {
  name: string
  version: number
  expressions: number
  motions: number
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

interface ScannedModel {
  name: string
  path: string
  version?: number
  textures?: number
  expressions?: number
  motions?: number
  motionGroups?: string[]
  hasPhysics?: boolean
  hasPose?: boolean
  error?: string
}

interface RegisteredModel {
  name: string
  path: string
  applied: boolean
  addedAt: number
  version?: number
  textures?: number
  expressions?: number
  motions?: number
  motionGroups?: string[]
  hasPhysics?: boolean
  hasPose?: boolean
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

  // 控制面板状态（全部通过 live2d5_call 获取）
  const [liveStatus, setLiveStatus] = useState<LiveStatus>(defaultLiveStatus)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [motionQueue, setMotionQueue] = useState<{ isFinished: boolean; queueLength: number; currentPriority: number } | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [targetFPS, setTargetFPS] = useState<number>(60)

  // 添加模型弹窗状态
  const [showAddModel, setShowAddModel] = useState(false)
  const [scanPath, setScanPath] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScannedModel[] | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanSuccess, setScanSuccess] = useState<string | null>(null)
  const [loadingModel, setLoadingModel] = useState<string | null>(null)

  // 表情/动作播放状态
  const [playingExpression, setPlayingExpression] = useState(false)
  const [playingMotion, setPlayingMotion] = useState(false)

  // 鼠标跟随状态
  const [mouseTracking, setMouseTracking] = useState(true)

  // 模型库状态
  const [registeredModels, setRegisteredModels] = useState<RegisteredModel[]>([])
  const [selectedScans, setSelectedScans] = useState<Set<string>>(new Set())
  const [registering, setRegistering] = useState(false)

  // ★ 新增：音频/气泡/缩放设置状态
  const [audioType, setAudioType] = useState<'microphone' | 'wav' | 'none'>('none')
  const [bubbleInput, setBubbleInput] = useState('')
  const [modelScale, setModelScale] = useState<number>(0.85)

  /** 刷新已注册模型列表 */
  const refreshRegisteredModels = useCallback(async () => {
    try {
      const result = await window.electronAPI.invoke('live2d5_get_registered_models')
      if (result?.success && Array.isArray(result.data)) {
        setRegisteredModels(result.data)
      }
    } catch {}
  }, [])

  /** 封装方法：一次获取控制面板全部数据（状态 + 模型信息 + 截图） */
  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    try {
      // 1. 查窗口状态
      const statusRes = await window.electronAPI.invoke('live2d5_status')
      if (statusRes?.success) setStatus(statusRes.data)

      if (!statusRes?.data?.windowOpen) {
        setLiveStatus(defaultLiveStatus)
        setModelInfo(null)
        setMotionQueue(null)
        setPreviewImage(null)
        return
      }

      // 2. 一次 live2d5_call 拿实时状态 + 模型信息 + 动作队列 + 截图
      const result = await window.electronAPI.invoke('live2d5_call', {
        code: `(() => {
          const s = window.__cubism5Service;
          if (!s) return null;
          const m = s.model;
          return {
            liveStatus: s.getLiveStatus(),
            modelInfo: m ? {
              name: s._activeModelName || '',
              version: m._moc?.getMocVersion?.() ?? 0,
              expressions: m.expressionNames?.length ?? 0,
              motions: m.totalMotionCount ?? 0,
            } : null,
            motionQueue: m?.getMotionQueueStatus?.() ?? null,
            preview: s.getPreviewImage?.() ?? null,
            fps: s.getTargetFPS?.() ?? 60,
            audioType: m?.getAudioInputType?.() ?? 'none',
            bubble: s.getBubbleText?.() ?? null,
          };
        })()`
      })

      if (result?.success && result.data) {
        const d = result.data as {
          liveStatus: LiveStatus
          modelInfo: ModelInfo | null
          motionQueue: typeof motionQueue
          preview: string | null
          fps: number
          audioType: string
          bubble: string | null
        }
        if (d.liveStatus) setLiveStatus(d.liveStatus)
        setModelInfo(d.modelInfo ?? null)
        if (d.motionQueue) setMotionQueue(d.motionQueue)
        if (d.preview) setPreviewImage(d.preview)
        if (d.fps != null) setTargetFPS(d.fps)
        if (d.audioType) setAudioType(d.audioType as typeof audioType)
        if (d.bubble != null) setBubbleInput(d.bubble)
      }
    } catch {}
    setRefreshing(false)
  }, [])

  useEffect(() => {
    refreshRegisteredModels().then(() => {
      window.electronAPI.invoke('live2d5_get_applied_model').then((res: { success: boolean; data: { scale?: number } | null }) => {
        if (res?.success && res.data?.scale) setModelScale(res.data.scale)
      }).catch(() => {})
    })
  }, [refreshRegisteredModels])

  /** 打开宠物窗口 */
  const handleOpen = useCallback(async () => {
    setLoading(true)
    try {
      await window.electronAPI.invoke('live2d5_open')
      await refreshAll()
    } catch (err) {
      console.error('打开 Live2D 5 窗口失败:', err)
    }
    setLoading(false)
  }, [refreshAll])

  /** 关闭宠物窗口 */
  const handleClose = useCallback(async () => {
    setLoading(true)
    try {
      await window.electronAPI.invoke('live2d5_close')
      await refreshAll()
      setPreviewImage(null)
    } catch (err) {
      console.error('关闭 Live2D 5 窗口失败:', err)
    }
    setLoading(false)
  }, [refreshAll])

  /** 切换模型 */
  const handleSwitchModel = useCallback(async (name: string) => {
    try {
      await window.electronAPI.invoke('live2d5_switch_model', { name })
      await refreshAll()
    } catch (err) {
      console.error('切换模型失败:', err)
    }
  }, [refreshAll])

  /** 卸载模型 */
  const handleUnloadModel = useCallback(async (name: string) => {
    try {
      await window.electronAPI.invoke('live2d5_unload_model', { name })
      await refreshAll()
    } catch (err) {
      console.error('卸载模型失败:', err)
    }
  }, [refreshAll])

  /** 重新加载模型 */
  const handleReloadModel = useCallback(async () => {
    setReloading(true)
    try {
      await window.electronAPI.invoke('live2d5_reload_model')
      // 重新加载后自动刷新数据
      await refreshAll()
    } catch (err) {
      console.error('重新加载模型失败:', err)
    }
    setReloading(false)
  }, [refreshAll])

  /** 播放表情（通过 live2d5_call 直接调 setRandomExpression） */
  const handlePlayExpression = useCallback(async () => {
    if (!modelInfo || modelInfo.expressions === 0) return
    setPlayingExpression(true)
    try {
      await window.electronAPI.invoke('live2d5_call', {
        code: '__cubism5Service.model.setRandomExpression()'
      })
    } catch (err) {
      console.error('播放表情失败:', err)
    }
    setPlayingExpression(false)
  }, [modelInfo])

  /** 播放动作（通过 live2d5_call 直接调 startRandomMotion） */
  const handlePlayMotion = useCallback(async () => {
    if (!modelInfo || modelInfo.motions === 0) return
    setPlayingMotion(true)
    try {
      await window.electronAPI.invoke('live2d5_call', {
        code: `(() => {
          const m = window.__cubism5Service?.model;
          if (!m) return;
          const groups = m.motionGroups;
          const g = groups.find(g => g.group === 'TapBody') || groups.find(g => g.group !== 'Idle') || groups[0];
          if (g) m.startRandomMotion(g.group, 300);
        })()`
      })
    } catch (err) {
      console.error('播放动作失败:', err)
    }
    setPlayingMotion(false)
  }, [modelInfo])

  /** 切换鼠标跟随 */
  const handleToggleMouseTracking = useCallback(async () => {
    const next = !mouseTracking
    setMouseTracking(next)
    try {
      await window.electronAPI.invoke('live2d5_toggle_mouse_tracking', { enabled: next })
    } catch (err) {
      console.error('切换鼠标跟随失败:', err)
      setMouseTracking(!next) // 回滚
    }
  }, [mouseTracking])

  /** ★ 新增：设置目标帧率 */
  const handleSetFPS = useCallback(async (fps: number) => {
    try {
      await window.electronAPI.invoke('live2d5_set_fps', { fps })
      setTargetFPS(fps)
    } catch (err) {
      console.error('设置帧率失败:', err)
    }
  }, [])

  /** ★ 新增：切换音频输入源 */
  const handleSwitchAudio = useCallback(async (type: 'microphone' | 'none') => {
    try {
      if (type === 'microphone') {
        const res = await window.electronAPI.invoke('live2d5_switch_to_microphone') as { success: boolean; error?: string }
        if (res.success) {
          setAudioType('microphone')
        } else {
          setScanError(res.error || '麦克风启动失败')
        }
      } else {
        await window.electronAPI.invoke('live2d5_stop_audio')
        setAudioType('none')
      }
    } catch (err) {
      console.error('切换音频失败:', err)
    }
  }, [])

  /** ★ 新增：设置对话气泡 */
  const handleSetBubble = useCallback(async () => {
    try {
      const text = bubbleInput.trim() || null
      await window.electronAPI.invoke('live2d5_set_bubble', { text })
    } catch (err) {
      console.error('设置气泡失败:', err)
    }
  }, [bubbleInput])

  /** ★ 新增：清除气泡 */
  const handleClearBubble = useCallback(async () => {
    try {
      await window.electronAPI.invoke('live2d5_set_bubble', { text: null })
      setBubbleInput('')
    } catch (err) {
      console.error('清除气泡失败:', err)
    }
  }, [])

  /** 扫描模型目录 */
  const handleScanModel = useCallback(async () => {
    if (!scanPath.trim()) {
      setScanError('请输入模型目录路径')
      return
    }
    setScanning(true)
    setScanError(null)
    setScanSuccess(null)
    setScanResult(null)
    setSelectedScans(new Set())
    try {
      const result = await window.electronAPI.invoke('live2d5_scan_model', { dirPath: scanPath.trim() })
      if (result?.success && Array.isArray(result.data)) {
        setScanResult(result.data)
        setScanSuccess(`扫描完成，找到 ${result.data.length} 个模型`)
      } else {
        setScanError(result?.error || '扫描失败')
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : '扫描出错')
    }
    setScanning(false)
  }, [scanPath])

  /** 选择文件夹并自动扫描 */
  const handleSelectDirectory = useCallback(async () => {
    try {
      const result = await window.electronAPI.invoke('live2d5_select_directory')
      if (result?.success && result.filePath) {
        setScanPath(result.filePath)
        // 选择后自动扫描
        setScanning(true)
        setScanError(null)
        setScanSuccess(null)
        setScanResult(null)
        setSelectedScans(new Set())
        try {
          const scanRes = await window.electronAPI.invoke('live2d5_scan_model', { dirPath: result.filePath })
          if (scanRes?.success && Array.isArray(scanRes.data)) {
            setScanResult(scanRes.data)
            setScanSuccess(`扫描完成，找到 ${scanRes.data.length} 个模型`)
          } else {
            setScanError(scanRes?.error || '扫描失败')
          }
        } catch (err) {
          setScanError(err instanceof Error ? err.message : '扫描出错')
        }
        setScanning(false)
      }
    } catch (err) {
      console.error('选择目录失败:', err)
    }
  }, [])

  /** 勾选/取消勾选扫描结果 */
  const toggleScanSelection = useCallback((path: string) => {
    setSelectedScans(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  /** 全选/取消全选扫描结果 */
  const toggleSelectAll = useCallback(() => {
    if (!scanResult) return
    if (selectedScans.size === scanResult.filter(m => !m.error).length) {
      setSelectedScans(new Set())
    } else {
      setSelectedScans(new Set(scanResult.filter(m => !m.error).map(m => m.path)))
    }
  }, [scanResult, selectedScans])

  /** 添加选中模型到模型库 */
  const handleAddSelectedModels = useCallback(async () => {
    if (!scanResult || selectedScans.size === 0) return
    setRegistering(true)
    try {
      const toAdd = scanResult
        .filter(m => selectedScans.has(m.path) && !m.error)
        .map(m => ({
          name: m.name,
          path: m.path,
          version: m.version,
          textures: m.textures,
          expressions: m.expressions,
          motions: m.motions,
          motionGroups: m.motionGroups,
          hasPhysics: m.hasPhysics,
          hasPose: m.hasPose,
        }))
      const result = await window.electronAPI.invoke('live2d5_register_models', { models: toAdd })
      if (result?.success) {
        setScanSuccess(`已添加 ${result.added ?? toAdd.length} 个模型到模型库`)
        setSelectedScans(new Set())
        await refreshRegisteredModels()
      } else {
        setScanError(result?.error || '添加失败')
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : '添加出错')
    }
    setRegistering(false)
  }, [scanResult, selectedScans, refreshRegisteredModels])

  /** 应用模型（设置为已应用，需先关闭宠物窗口） */
  const handleApplyModel = useCallback(async (model: RegisteredModel) => {
    if (status.windowOpen) {
      setScanError('宠物窗口运行中，请先关闭窗口再切换模型')
      return
    }
    if (loadingModel) return  // 防止连点
    setLoadingModel(model.path)
    try {
      const result = await window.electronAPI.invoke('live2d5_apply_model', { path: model.path })
      if (result?.success) {
        await refreshRegisteredModels()
      } else {
        setScanError(result?.error || '应用失败')
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : '应用出错')
    }
    setLoadingModel(null)
  }, [status.windowOpen, refreshRegisteredModels, loadingModel])

  /** 从模型库移除（需先关闭宠物窗口，已应用的不能移除） */
  const handleRemoveRegistered = useCallback(async (modelPath: string) => {
    if (status.windowOpen) {
      setScanError('宠物窗口运行中，请先关闭窗口再操作')
      return
    }
    try {
      const result = await window.electronAPI.invoke('live2d5_unregister_model', { path: modelPath })
      if (!result?.success) {
        setScanError(result?.error || '移除失败')
        return
      }
      await refreshRegisteredModels()
    } catch {}
  }, [status.windowOpen, refreshRegisteredModels])

  /** 关闭添加模型弹窗 */
  const handleCloseAddModel = useCallback(() => {
    setShowAddModel(false)
    setScanPath('')
    setScanResult(null)
    setScanError(null)
    setScanSuccess(null)
    setSelectedScans(new Set())
  }, [])

  /** 提示信息自动消失 */
  useEffect(() => {
    if (scanError || scanSuccess) {
      const timer = setTimeout(() => {
        setScanError(null)
        setScanSuccess(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [scanError, scanSuccess])

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
                onClick={refreshAll}
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
              <button
                className="btn btn-secondary"
                onClick={handlePlayExpression}
                disabled={playingExpression || !status.windowOpen || !modelInfo || modelInfo.expressions === 0}
              >
                {playingExpression ? '切换中...' : '🎭 播放表情'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handlePlayMotion}
                disabled={playingMotion || !status.windowOpen || !modelInfo || modelInfo.motions === 0}
              >
                {playingMotion ? '播放中...' : '🎬 播放动作'}
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
                      {modelInfo?.name || '无模型'}
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
                {/* 鼠标跟随开关 */}
                <div className="live2d5-feature-card">
                  <div className="live2d5-card-header">
                    <span className="live2d5-card-title">
                      <span className="live2d5-card-icon">🖱️</span>
                      鼠标跟随
                    </span>
                    <button
                      className={`live2d5-toggle ${mouseTracking ? 'live2d5-toggle--active' : ''}`}
                      onClick={handleToggleMouseTracking}
                      disabled={!status.windowOpen}
                      aria-label="切换鼠标跟随"
                    />
                  </div>
                  <div className="live2d5-card-desc">
                    开启后模型眼睛将跟随鼠标移动
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
                      <span className="live2d5-info-value">{modelInfo?.name || '-'}</span>
                    </div>
                    <div className="live2d5-info-item">
                      <span className="live2d5-info-label">版本</span>
                      <span className="live2d5-info-value">{modelInfo ? `v${modelInfo.version}` : '-'}</span>
                    </div>
                    <div className="live2d5-info-item">
                      <span className="live2d5-info-label">表情数</span>
                      <span className="live2d5-info-value">{modelInfo?.expressions ?? 0}</span>
                    </div>
                    <div className="live2d5-info-item">
                      <span className="live2d5-info-label">动作数</span>
                      <span className="live2d5-info-value">
                        {modelInfo?.motions ?? 0}
                      </span>
                    </div>
                    <div className="live2d5-info-item">
                      <span className="live2d5-info-label">鼠标跟随</span>
                      <span className="live2d5-info-value">{mouseTracking ? '开启' : '关闭'}</span>
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
                        <span className={`live2d5-status-dot ${mouseTracking ? 'live2d5-status-dot--active' : 'live2d5-status-dot--off'}`} />
                        {mouseTracking ? '开启' : '关闭'}
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
                    {/* ★ 新增：动作队列状态 */}
                    {motionQueue && (
                      <>
                        <div className="live2d5-status-item">
                          <span className="live2d5-status-label">动作队列</span>
                          <span className="live2d5-status-value">
                            <span className={`live2d5-status-dot ${motionQueue.isFinished ? 'live2d5-status-dot--off' : 'live2d5-status-dot--active'}`} />
                            {motionQueue.isFinished ? '空闲' : `播放中 (${motionQueue.queueLength})`}
                          </span>
                        </div>
                        <div className="live2d5-status-item">
                          <span className="live2d5-status-label">动作优先级</span>
                          <span className="live2d5-status-value">{motionQueue.currentPriority}</span>
                        </div>
                      </>
                    )}
                    {/* ★ 新增：帧率设置 */}
                    <div className="live2d5-status-item">
                      <span className="live2d5-status-label">帧率限制</span>
                      <div className="live2d5-fps-selector">
                        {[30, 60, 120, 0].map(fps => (
                          <button
                            key={fps}
                            className={`live2d5-fps-btn ${targetFPS === fps ? 'live2d5-fps-btn--active' : ''}`}
                            onClick={() => handleSetFPS(fps)}
                          >
                            {fps === 0 ? '无限制' : `${fps} FPS`}
                          </button>
                        ))}
                      </div>
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
            {/* 顶部工具栏 */}
            <div className="live2d5-models-toolbar">
              <button
                className="btn btn-primary"
                onClick={() => setShowAddModel(true)}
              >
                ＋ 添加模型
              </button>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                已注册 {registeredModels.length} 个模型
              </span>
            </div>

            {/* 模型列表 */}
            {registeredModels.length === 0 ? (
              <div className="live2d5-empty">
                <span style={{ fontSize: 32, opacity: 0.4 }}>📦</span>
                <p>暂无已注册的模型，点击上方按钮添加</p>
              </div>
            ) : (
              <div className="live2d5-registered-list">
                {registeredModels.map(m => {
                  const isApplied = m.applied
                  return (
                    <div key={m.path} className={`live2d5-registered-card ${isApplied ? 'live2d5-registered-card--active' : ''}`}>
                      <div className="live2d5-registered-info">
                        <div className="live2d5-registered-name">
                          {isApplied && <span className="live2d5-status-dot live2d5-status-dot--active" />}
                          {m.name}
                          {m.version !== undefined && <span className="live2d5-scan-card-version">v{m.version}</span>}
                        </div>
                        {m.expressions !== undefined && (
                          <div className="live2d5-scan-card-details">
                            <span>🎭 表情: {m.expressions}</span>
                            <span>🎬 动作: {m.motions ?? 0}</span>
                            <span>🖼️ 贴图: {m.textures ?? 0}</span>
                            {m.hasPhysics && <span>⚙️ 物理演算</span>}
                            {m.hasPose && <span>🧍 姿态</span>}
                          </div>
                        )}
                        {m.motionGroups && m.motionGroups.length > 0 && (
                          <div className="live2d5-scan-card-groups">
                            动作组: {m.motionGroups.join(', ')}
                          </div>
                        )}
                        <div className="live2d5-registered-path" title={m.path}>📁 {m.path}</div>
                      </div>
                      <div className="live2d5-registered-actions">
                        {isApplied ? (
                          <button className="btn btn-applied" disabled>✓ 已应用</button>
                        ) : (
                          <button
                            className="btn btn-primary"
                            onClick={() => handleApplyModel(m)}
                            disabled={loadingModel === m.path}
                          >
                            {loadingModel === m.path ? '应用中...' : '应用'}
                          </button>
                        )}
                        <button
                          className="btn btn-ghost"
                          onClick={() => handleRemoveRegistered(m.path)}
                          title="从模型库移除"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 添加模型弹窗 */}
            {showAddModel && <ModuleModal
              onClose={handleCloseAddModel}
              title="添加模型"
              footer={
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    {scanResult && scanResult.length > 0 && (
                      <>
                        <button className="btn btn-ghost" onClick={toggleSelectAll}>
                          {selectedScans.size === scanResult.filter(m => !m.error).length ? '取消全选' : '全选'}
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={handleAddSelectedModels}
                          disabled={selectedScans.size === 0 || registering}
                        >
                          {registering ? '添加中...' : `添加到模型库 (${selectedScans.size})`}
                        </button>
                      </>
                    )}
                  </div>
                  <button className="btn btn-secondary" onClick={handleCloseAddModel}>
                    关闭
                  </button>
                </div>
              }
            >
              <div className="live2d5-scan-section">
                {/* 扫描输入区域 */}
                <div className="live2d5-scan-input-row">
                  <input
                    type="text"
                    className="live2d5-scan-input"
                    placeholder="输入或选择模型目录路径"
                    value={scanPath}
                    onChange={e => setScanPath(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleScanModel()}
                    disabled={scanning}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={handleSelectDirectory}
                    disabled={scanning}
                  >
                    📂 选择文件夹
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleScanModel}
                    disabled={scanning || !scanPath.trim()}
                  >
                    {scanning ? '扫描中...' : '扫描'}
                  </button>
                </div>

                {/* 提示信息 */}
                {scanError && (
                  <div className="live2d5-scan-alert live2d5-scan-alert--error">
                    ❌ {scanError}
                  </div>
                )}
                {scanSuccess && (
                  <div className="live2d5-scan-alert live2d5-scan-alert--success">
                    ✅ {scanSuccess}
                  </div>
                )}

                {/* 扫描结果 */}
                {scanResult && scanResult.length > 0 && (
                  <div className="live2d5-scan-results">
                    {scanResult.map((model: ScannedModel, idx: number) => (
                      <div key={idx} className={`live2d5-scan-card ${selectedScans.has(model.path) ? 'live2d5-scan-card--selected' : ''}`}>
                        {model.error ? (
                          <div className="live2d5-scan-card-error">
                            <span className="live2d5-scan-card-name">{model.name}</span>
                            <span className="live2d5-scan-card-err-text">{model.error}</span>
                          </div>
                        ) : (
                          <>
                            <div className="live2d5-scan-card-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedScans.has(model.path)}
                                  onChange={() => toggleScanSelection(model.path)}
                                  className="live2d5-scan-checkbox"
                                />
                                <span className="live2d5-scan-card-name">{model.name}</span>
                              </div>
                              <span className="live2d5-scan-card-version">v{model.version}</span>
                            </div>
                            <div className="live2d5-scan-card-details">
                              <span>🎭 表情: {model.expressions}</span>
                              <span>🎬 动作: {model.motions}</span>
                              <span>🖼️ 贴图: {model.textures}</span>
                              {model.hasPhysics && <span>⚙️ 物理演算</span>}
                              {model.hasPose && <span>🧍 姿态</span>}
                            </div>
                            {model.motionGroups && model.motionGroups.length > 0 && (
                              <div className="live2d5-scan-card-groups">
                                动作组: {model.motionGroups.join(', ')}
                              </div>
                            )}
                            <div className="live2d5-scan-card-path" title={model.path}>
                              📁 {model.path}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ModuleModal>}
          </div>
        )}

        {/* ====== 设置 ====== */}
        {activeTab === 'settings' && (
          <div className="live2d5-settings-panel">
            {/* ★ 新增：音频输入设置 */}
            <div className="live2d5-info">
              <h4>🎤 音频输入（LipSync）</h4>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                <button
                  className={`btn ${audioType === 'microphone' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleSwitchAudio('microphone')}
                  disabled={!status.windowOpen}
                >
                  🎙️ 麦克风
                </button>
                <button
                  className={`btn ${audioType === 'none' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleSwitchAudio('none')}
                  disabled={!status.windowOpen}
                >
                  ⏹️ 关闭
                </button>
              </div>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--spacing-xs)' }}>
                当前: {audioType === 'microphone' ? '🎙️ 麦克风实时输入' : '未使用音频'}
              </p>
            </div>

            {/* ★ 新增：对话气泡 */}
            <div className="live2d5-info" style={{ marginTop: 'var(--spacing-md)' }}>
              <h4>💬 对话气泡</h4>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
                <input
                  type="text"
                  className="live2d5-scan-input"
                  placeholder="输入气泡文字..."
                  value={bubbleInput}
                  onChange={e => setBubbleInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSetBubble()}
                  disabled={!status.windowOpen}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleSetBubble}
                  disabled={!status.windowOpen}
                >
                  显示
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={handleClearBubble}
                  disabled={!status.windowOpen}
                >
                  清除
                </button>
              </div>
            </div>

            {/* ★ 模型缩放 */}
            <div className="live2d5-info" style={{ marginTop: 'var(--spacing-md)' }}>
              <h4>📐 模型缩放</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
                <input
                  type="range"
                  min="0.3"
                  max="2.0"
                  step="0.05"
                  value={modelScale}
                  onChange={e => setModelScale(parseFloat(e.target.value))}
                  onMouseUp={async () => {
                    const applied = registeredModels.find(m => m.applied)
                    if (applied) {
                      await window.electronAPI.invoke('live2d5_set_scale', { path: applied.path, scale: modelScale })
                    }
                  }}
                  onTouchEnd={async () => {
                    const applied = registeredModels.find(m => m.applied)
                    if (applied) {
                      await window.electronAPI.invoke('live2d5_set_scale', { path: applied.path, scale: modelScale })
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: 48, textAlign: 'right', fontSize: 'var(--font-size-sm)' }}>
                  {modelScale.toFixed(2)}
                </span>
              </div>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--spacing-xs)' }}>
                缩放需重新打开宠物窗口生效
              </p>
            </div>

            <div className="live2d5-info" style={{ marginTop: 'var(--spacing-md)' }}>
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
          </div>
        )}
      </div>
    </div>
  )
}

export default Live2D5Page
