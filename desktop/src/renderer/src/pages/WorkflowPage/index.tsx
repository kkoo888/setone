import React, { useState, useEffect, useCallback } from 'react'

interface Workflow { id: string; name: string; description: string; enabled: boolean; trigger: { type: string; cron?: string }; steps: unknown[]; createdAt: number; runCount: number }
interface WorkflowRun { id: string; workflowId: string; startedAt: number; status: string; error?: string }

export function WorkflowPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [logs, setLogs] = useState<WorkflowRun[]>([])
  const [activeTab, setActiveTab] = useState<'list' | 'logs' | 'templates'>('list')
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newTrigger, setNewTrigger] = useState('manual')
  const [newCron, setNewCron] = useState('')

  const loadWorkflows = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('workflow_list')
      if (res?.success) setWorkflows(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  const loadLogs = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('workflow_log', { limit: 50 })
      if (res?.success) setLogs(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadWorkflows(); loadLogs() }, [loadWorkflows, loadLogs])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setLoading(true)
    try {
      const res = await window.electronAPI.invoke('workflow_create', {
        name: newName, description: newDesc,
        trigger: newTrigger === 'cron' ? { type: 'cron', cron: newCron } : { type: newTrigger },
        steps: [{ name: '示例步骤', capability: 'ai_chat', params: { prompt: '你好' }, onError: 'stop' }]
      })
      if (res?.success) { setShowCreate(false); setNewName(''); setNewDesc(''); loadWorkflows() }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleExecute = async (id: string) => {
    setLoading(true)
    try {
      await window.electronAPI.invoke('workflow_execute', { workflowId: id })
      loadLogs()
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.invoke('workflow_delete', { workflowId: id })
      loadWorkflows()
    } catch { /* ignore */ }
  }

  const handleCreateFromTemplate = async (template: { name: string; desc: string; trigger: string }) => {
    try {
      const res = await window.electronAPI.invoke('workflow_create', {
        name: template.name,
        description: template.desc,
        trigger: { type: template.trigger }
      })
      if (res?.success) { setActiveTab('list'); loadWorkflows() }
    } catch { /* ignore */ }
  }

  return (
    <div className="wf-page">
      <div className="wf-header">
        <h1>🔄 工作流</h1>
        <div className="wf-tabs">
          {(['list', 'logs', 'templates'] as const).map(tab => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}>
              {tab === 'list' ? '📋 工作流' : tab === 'logs' ? '📜 执行日志' : '📦 模板'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="wf-section">
          <button onClick={() => setShowCreate(true)} className="btn btn-primary">＋ 新建工作流</button>
          {showCreate && (
            <div className="wf-create-form">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="工作流名称" className="wf-input" />
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述（可选）" className="wf-input" />
              <select value={newTrigger} onChange={e => setNewTrigger(e.target.value)} className="wf-select">
                <option value="manual">手动触发</option>
                <option value="cron">定时触发</option>
                <option value="event">事件触发</option>
                <option value="hotkey">快捷键触发</option>
              </select>
              {newTrigger === 'cron' && <input value={newCron} onChange={e => setNewCron(e.target.value)} placeholder="Cron 表达式" className="wf-input" />}
              <div className="wf-form-actions">
                <button onClick={handleCreate} disabled={loading} className="btn btn-primary">创建</button>
                <button onClick={() => setShowCreate(false)} className="btn">取消</button>
              </div>
            </div>
          )}
          <div className="wf-list">
            {workflows.map(wf => (
              <div key={wf.id} className={`wf-card ${!wf.enabled ? 'wf-disabled' : ''}`}>
                <div className="wf-card-header">
                  <span className="wf-name">{wf.name}</span>
                  <span className={`wf-badge wf-badge-${wf.trigger.type}`}>{wf.trigger.type}</span>
                </div>
                <div className="wf-desc">{wf.description || '无描述'}</div>
                <div className="wf-meta">{wf.steps.length} 步骤 · 执行 {wf.runCount} 次</div>
                <div className="wf-actions">
                  <button onClick={() => handleExecute(wf.id)} disabled={loading || !wf.enabled} className="btn btn-primary btn-sm">▶ 执行</button>
                  <button onClick={() => handleDelete(wf.id)} className="btn btn-danger btn-sm">🗑 删除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="wf-section">
          {logs.length === 0 ? <div className="wf-empty">暂无执行记录</div> : logs.map(log => (
            <div key={log.id} className={`wf-log-item wf-status-${log.status}`}>
              <span className="wf-log-status">{log.status === 'success' ? '✅' : log.status === 'failed' ? '❌' : '⏳'}</span>
              <span className="wf-log-id">{log.workflowId.slice(0, 8)}</span>
              <span className="wf-log-time">{new Date(log.startedAt).toLocaleString()}</span>
              {log.error && <span className="wf-log-error">{log.error}</span>}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="wf-section">
          {[
            { name: '每日日报', desc: '聚合今日工作生成日报', trigger: 'cron' },
            { name: '文件备份', desc: '备份指定目录', trigger: 'cron' },
            { name: '代码审查', desc: 'AI审查当前文件', trigger: 'manual' }
          ].map((t, i) => (
            <div key={i} className="wf-card">
              <div className="wf-name">{t.name}</div>
              <div className="wf-desc">{t.desc}</div>
              <button onClick={() => handleCreateFromTemplate(t)} className="btn btn-primary btn-sm">📥 使用模板</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
