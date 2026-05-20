import React, { useState, useEffect, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ChartHistogram, Refresh, Brain, Tips, Help, Attention } from '../../utils/statusMessages'
import { registerPolling, unregisterPolling, tickPolling, onPollingUpdate } from '../../utils/polling-helper'

const chartI = React.createElement(ChartHistogram, { size: 16, fill: 'currentColor', theme: 'outline' })
const refreshI = React.createElement(Refresh, { size: 16, fill: 'currentColor', theme: 'outline' })
const brainI = React.createElement(Brain, { size: 16, fill: 'currentColor', theme: 'outline' })
const tipsI = React.createElement(Tips, { size: 16, fill: 'currentColor', theme: 'outline' })
const warnI = React.createElement(Attention, { size: 16, fill: '#ef4444', theme: 'outline' })

interface SystemInfo { cpu: number; memory: { used: number; total: number; percent: number }; disk: { used: number; total: number; percent: number }; uptime: number; platform: string; hostname: string }
interface ModuleStatus { id: string; name: string; status: string; enabled: boolean }
interface PollingTask {
  id: string; module: string; description: string; intervalMs: number; status: string
  startedAt: number; lastRunAt?: number; nextRunAt?: number
  moduleId?: string; tickCount?: number; lastActivity?: string; lastError?: string
}

export function SystemDashboardPage() {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [modules, setModules] = useState<ModuleStatus[]>([])
  const [pollingTasks, setPollingTasks] = useState<PollingTask[]>([])
  const [refreshInterval, setRefreshInterval] = useState(5000)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedTask, setSelectedTask] = useState<PollingTask | null>(null)

  const loadSysInfo = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('system_info')
      if (res?.success) setSysInfo(res.data)
    } catch { /* ignore */ }
    try {
      const res = await window.electronAPI.invoke('module:list')
      if (Array.isArray(res)) setModules(res)
      else if (res?.success) setModules(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    window.electronAPI?.invoke('polling:list').then((tasks: unknown) => {
      if (Array.isArray(tasks)) setPollingTasks(tasks as PollingTask[])
    }).catch(() => {})
    const unsub = onPollingUpdate((tasks: unknown[]) => {
      setPollingTasks(tasks as PollingTask[])
      setSelectedTask(prev => {
        if (!prev) return null
        const updated = (tasks as PollingTask[]).find(t => t.id === prev.id)
        return updated ?? null
      })
    })
    return unsub
  }, [])

  useEffect(() => {
    registerPolling({
      id: 'dashboard-refresh',
      module: '系统仪表盘',
      description: '系统信息刷新（CPU/内存/磁盘/模块状态）',
      intervalMs: refreshInterval,
    })
    return () => { unregisterPolling('dashboard-refresh') }
  }, [refreshInterval])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => {
      loadSysInfo()
      tickPolling('dashboard-refresh', '正在刷新系统信息和模块状态')
    }, refreshInterval)
    return () => clearInterval(timer)
  }, [autoRefresh, refreshInterval, loadSysInfo])

  useEffect(() => { loadSysInfo() }, [loadSysInfo])

  const fmtBytes = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)}MB` : `${(b / 1073741824).toFixed(1)}GB`
  const fmtUptime = (s: number) => { const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); return `${d}天${h}时${m}分` }
  const barColor = (pct: number) => pct > 90 ? 'var(--color-error)' : pct > 70 ? 'var(--color-warning)' : 'var(--color-success)'

  const fmtInterval = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(0)}秒`
    if (ms < 3600000) return `${(ms / 60000).toFixed(0)}分钟`
    return `${(ms / 3600000).toFixed(0)}小时`
  }

  const fmtTime = (ts?: number) => {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const fmtDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(0)}秒`
    if (ms < 3600000) return `${Math.floor(ms / 60000)}分${Math.floor((ms % 60000) / 1000)}秒`
    return `${Math.floor(ms / 3600000)}时${Math.floor((ms % 3600000) / 60000)}分`
  }

  const statusLabel = (s: string) => {
    const map: Record<string, { text: string; color: string }> = {
      running: { text: '运行中', color: 'var(--color-success)' },
      paused: { text: '已暂停', color: 'var(--color-warning)' },
      stopped: { text: '已停止', color: 'var(--color-text-tertiary)' },
    }
    return map[s] ?? { text: s, color: 'var(--color-text-tertiary)' }
  }

  return (
    <div className="dash-page mod-page">
      <ModuleHeader
        icon={chartI}
        title="系统仪表盘"
        actions={
          <div className="dash-controls">
            <label><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> 自动刷新</label>
            <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))} className="dash-select">
              <option value={2000}>2秒</option><option value={5000}>5秒</option><option value={10000}>10秒</option><option value={30000}>30秒</option>
            </select>
            <button onClick={() => { loadSysInfo() }} className="btn btn-sm">{refreshI} 刷新</button>
          </div>
        }
      />
      <div className="dash-content">
        {sysInfo && (
          <div className="dash-grid">
            <div className="dash-card">
              <h3>🖥 CPU</h3>
              <div className="dash-bar"><div className="dash-bar-fill" style={{ width: `${sysInfo.cpu}%`, backgroundColor: barColor(sysInfo.cpu) }} /></div>
              <span className="dash-pct">{sysInfo.cpu.toFixed(1)}%</span>
            </div>
            <div className="dash-card">
              <h3>{brainI} 内存</h3>
              <div className="dash-bar"><div className="dash-bar-fill" style={{ width: `${sysInfo.memory.percent}%`, backgroundColor: barColor(sysInfo.memory.percent) }} /></div>
              <span className="dash-pct">{fmtBytes(sysInfo.memory.used)} / {fmtBytes(sysInfo.memory.total)} ({sysInfo.memory.percent}%)</span>
            </div>
            <div className="dash-card">
              <h3>💾 磁盘</h3>
              <div className="dash-bar"><div className="dash-bar-fill" style={{ width: `${sysInfo.disk.percent}%`, backgroundColor: barColor(sysInfo.disk.percent) }} /></div>
              <span className="dash-pct">{fmtBytes(sysInfo.disk.used)} / {fmtBytes(sysInfo.disk.total)} ({sysInfo.disk.percent}%)</span>
            </div>
            <div className="dash-card">
              <h3>{tipsI} 系统</h3>
              <div className="dash-info"><span>运行时间</span><span>{fmtUptime(sysInfo.uptime)}</span></div>
              <div className="dash-info"><span>平台</span><span>{sysInfo.platform}</span></div>
              <div className="dash-info"><span>主机名</span><span>{sysInfo.hostname}</span></div>
            </div>
          </div>
        )}

        {/* ═══ 轮询监控 ═══ */}
        <div className="dash-modules">
          <h3>{refreshI} 轮询监控 <span className="dash-section-title">({pollingTasks.length} 个任务)</span></h3>
          {pollingTasks.length === 0 ? (
            <div className="dash-polling-empty">暂无活跃的轮询任务</div>
          ) : (
            <div className="dash-polling-list">
              {pollingTasks.map(task => {
                const st = statusLabel(task.status)
                return (
                  <div key={task.id} onClick={() => setSelectedTask(task)} className="dash-polling-item">
                    <span className="status-dot-sm" style={{ background: st.color }} />
                    <div className="dash-polling-info">
                      <div className="dash-polling-module">{task.module}</div>
                      <div className="dash-polling-desc">{task.description}</div>
                    </div>
                    <div className="dash-polling-meta">
                      <div className="dash-polling-interval">间隔 {fmtInterval(task.intervalMs)}</div>
                      <div className="dash-polling-time">
                        上次 {fmtTime(task.lastRunAt)} · 下次 {fmtTime(task.nextRunAt)}
                      </div>
                    </div>
                    <span className="dash-polling-status" style={{ background: `${st.color}15`, color: st.color }}>
                      {st.text}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ═══ 轮询详情弹窗 ═══ */}
        {selectedTask && (() => {
          const st = statusLabel(selectedTask.status)
          const running = selectedTask.status === 'running'
          const elapsed = running ? Date.now() - selectedTask.startedAt : 0
          return (
            <div className="overlay" onClick={() => setSelectedTask(null)}>
              <div className="modal-panel" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
                <div className="dash-detail-header">
                  <div className="dash-detail-title-group">
                    <span className="status-dot-sm" style={{ background: st.color }} />
                    <span className="dash-detail-title">{selectedTask.module}</span>
                    <span className="dash-polling-status" style={{ background: `${st.color}15`, color: st.color }}>{st.text}</span>
                  </div>
                  <button onClick={() => setSelectedTask(null)} className="dash-detail-close">✕</button>
                </div>

                <div className="dash-detail-body">
                  <div>
                    <div className="dash-detail-field-label">描述</div>
                    <div className="dash-detail-field-value">{selectedTask.description}</div>
                  </div>

                  <div className="dash-detail-grid">
                    <div>
                      <div className="dash-detail-field-label">轮询间隔</div>
                      <div className="dash-detail-field-value-bold">{fmtInterval(selectedTask.intervalMs)}</div>
                    </div>
                    <div>
                      <div className="dash-detail-field-label">累计执行</div>
                      <div className="dash-detail-field-value-bold">{selectedTask.tickCount ?? 0} 次</div>
                    </div>
                    <div>
                      <div className="dash-detail-field-label">上次执行</div>
                      <div className="dash-detail-field-value">{fmtTime(selectedTask.lastRunAt)}</div>
                    </div>
                    <div>
                      <div className="dash-detail-field-label">下次执行</div>
                      <div className="dash-detail-field-value">{fmtTime(selectedTask.nextRunAt)}</div>
                    </div>
                  </div>

                  <div>
                    <div className="dash-detail-field-label">已运行</div>
                    <div className="dash-detail-field-value">{fmtDuration(elapsed)}</div>
                  </div>

                  {selectedTask.lastActivity && (
                    <div className="dash-detail-callout">
                      <div className="dash-detail-field-label">📡 当前活动</div>
                      <div className="dash-detail-field-value-bold">{selectedTask.lastActivity}</div>
                    </div>
                  )}

                  {selectedTask.lastError && (
                    <div className="dash-detail-callout-error">
                      <div className="dash-detail-field-label" style={{ color: 'var(--color-error)' }}>{warnI} 最近错误</div>
                      <div className="dash-detail-error-text">{selectedTask.lastError}</div>
                    </div>
                  )}

                  {selectedTask.moduleId && (
                    <div>
                      <div className="dash-detail-field-label">绑定模块</div>
                      <div className="dash-detail-mono">{selectedTask.moduleId}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* ═══ 模块状态 ═══ */}
        <div className="dash-modules">
          <h3>🧩 模块状态</h3>
          <div className="dash-module-grid">
            {modules.map(m => (
              <div key={m.id} className={`dash-module-item ${m.status}`}>
                <span className={`status-dot status-${m.status}`} />
                <span className="dash-module-name">{m.name}</span>
                <span className="dash-module-status">{m.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
