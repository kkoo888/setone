import React, { useState, useEffect, useCallback } from 'react'

interface SystemInfo { cpu: number; memory: { used: number; total: number; percent: number }; disk: { used: number; total: number; percent: number }; uptime: number; platform: string; hostname: string }
interface ModuleStatus { id: string; name: string; status: string; enabled: boolean }

export function SystemDashboardPage() {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [modules, setModules] = useState<ModuleStatus[]>([])
  const [refreshInterval, setRefreshInterval] = useState(5000)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const loadSysInfo = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('system_info')
      if (res?.success) setSysInfo(res.data)
    } catch { /* ignore */ }
    try {
      // module:list 返回数组（非 {success, data} 格式）
      const res = await window.electronAPI.invoke('module:list')
      if (Array.isArray(res)) setModules(res)
      else if (res?.success) setModules(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadSysInfo() }, [loadSysInfo])
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(loadSysInfo, refreshInterval)
    return () => clearInterval(timer)
  }, [autoRefresh, refreshInterval, loadSysInfo])

  const fmtBytes = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)}MB` : `${(b / 1073741824).toFixed(1)}GB`
  const fmtUptime = (s: number) => { const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); return `${d}天${h}时${m}分` }
  const barColor = (pct: number) => pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e'

  return (
    <div className="dash-page">
      <div className="dash-header">
        <h1>📊 系统仪表盘</h1>
        <div className="dash-controls">
          <label><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> 自动刷新</label>
          <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))} className="dash-select">
            <option value={2000}>2秒</option><option value={5000}>5秒</option><option value={10000}>10秒</option><option value={30000}>30秒</option>
          </select>
          <button onClick={loadSysInfo} className="btn btn-sm">🔄 刷新</button>
        </div>
      </div>
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
