import React, { useState, useEffect, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { registerPolling, unregisterPolling, tickPolling } from '../../utils/polling-helper'

interface SystemInfo { cpu: number; memory: { used: number; total: number; percent: number }; disk: { used: number; total: number; percent: number }; uptime: number; platform: string; hostname: string }
interface ModuleStatus { id: string; name: string; status: string; enabled: boolean }
interface PollingTask { id: string; module: string; description: string; intervalMs: number; status: string; startedAt: number; lastRunAt?: number; nextRunAt?: number }

export function SystemDashboardPage() {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [modules, setModules] = useState<ModuleStatus[]>([])
  const [pollingTasks, setPollingTasks] = useState<PollingTask[]>([])
  const [refreshInterval, setRefreshInterval] = useState(5000)
  const [autoRefresh, setAutoRefresh] = useState(true)

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

  const loadPollingTasks = useCallback(async () => {
    try {
      const tasks = await window.electronAPI.invoke('polling:list')
      if (Array.isArray(tasks)) setPollingTasks(tasks)
    } catch { /* ignore */ }
  }, [])

  // 注册仪表盘自身的轮询
  useEffect(() => {
    registerPolling({
      id: 'dashboard-refresh',
      module: '系统仪表盘',
      description: '系统信息刷新（CPU/内存/磁盘/模块状态）',
      intervalMs: refreshInterval,
    })
    return () => { unregisterPolling('dashboard-refresh') }
  }, [refreshInterval])

  // 主轮询：加载系统信息 + 轮询列表
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => {
      loadSysInfo()
      loadPollingTasks()
      tickPolling('dashboard-refresh')
    }, refreshInterval)
    return () => clearInterval(timer)
  }, [autoRefresh, refreshInterval, loadSysInfo, loadPollingTasks])

  // 首次加载
  useEffect(() => { loadSysInfo(); loadPollingTasks() }, [loadSysInfo, loadPollingTasks])

  const fmtBytes = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)}MB` : `${(b / 1073741824).toFixed(1)}GB`
  const fmtUptime = (s: number) => { const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); return `${d}天${h}时${m}分` }
  const barColor = (pct: number) => pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e'

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

  const statusLabel = (s: string) => {
    const map: Record<string, { text: string; color: string }> = {
      running: { text: '运行中', color: '#22c55e' },
      paused: { text: '已暂停', color: '#f59e0b' },
      stopped: { text: '已停止', color: '#94a3b8' },
    }
    return map[s] ?? { text: s, color: '#94a3b8' }
  }

  return (
    <div className="dash-page mod-page">
      <ModuleHeader
        icon="📊"
        title="系统仪表盘"
        actions={
          <div className="dash-controls">
            <label><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> 自动刷新</label>
            <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))} className="dash-select">
              <option value={2000}>2秒</option><option value={5000}>5秒</option><option value={10000}>10秒</option><option value={30000}>30秒</option>
            </select>
            <button onClick={() => { loadSysInfo(); loadPollingTasks() }} className="btn btn-sm">🔄 刷新</button>
          </div>
        }
      />
      {sysInfo && (
        <div className="dash-grid">
          <div className="dash-card">
            <h3>🖥 CPU</h3>
            <div className="dash-bar"><div className="dash-bar-fill" style={{ width: `${sysInfo.cpu}%`, backgroundColor: barColor(sysInfo.cpu) }} /></div>
            <span className="dash-pct">{sysInfo.cpu.toFixed(1)}%</span>
          </div>
          <div className="dash-card">
            <h3>🧠 内存</h3>
            <div className="dash-bar"><div className="dash-bar-fill" style={{ width: `${sysInfo.memory.percent}%`, backgroundColor: barColor(sysInfo.memory.percent) }} /></div>
            <span className="dash-pct">{fmtBytes(sysInfo.memory.used)} / {fmtBytes(sysInfo.memory.total)} ({sysInfo.memory.percent}%)</span>
          </div>
          <div className="dash-card">
            <h3>💾 磁盘</h3>
            <div className="dash-bar"><div className="dash-bar-fill" style={{ width: `${sysInfo.disk.percent}%`, backgroundColor: barColor(sysInfo.disk.percent) }} /></div>
            <span className="dash-pct">{fmtBytes(sysInfo.disk.used)} / {fmtBytes(sysInfo.disk.total)} ({sysInfo.disk.percent}%)</span>
          </div>
          <div className="dash-card">
            <h3>ℹ️ 系统</h3>
            <div className="dash-info"><span>运行时间</span><span>{fmtUptime(sysInfo.uptime)}</span></div>
            <div className="dash-info"><span>平台</span><span>{sysInfo.platform}</span></div>
            <div className="dash-info"><span>主机名</span><span>{sysInfo.hostname}</span></div>
          </div>
        </div>
      )}

      {/* ═══ 轮询监控 ═══ */}
      <div className="dash-modules">
        <h3>🔄 轮询监控 <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>({pollingTasks.length} 个任务)</span></h3>
        {pollingTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            暂无活跃的轮询任务
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pollingTasks.map(task => {
              const st = statusLabel(task.status)
              return (
                <div key={task.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                  fontSize: 13,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{task.module}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{task.description}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>间隔 {fmtInterval(task.intervalMs)}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      上次 {fmtTime(task.lastRunAt)} · 下次 {fmtTime(task.nextRunAt)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: `${st.color}15`, color: st.color, fontWeight: 500,
                  }}>
                    {st.text}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
  )
}
