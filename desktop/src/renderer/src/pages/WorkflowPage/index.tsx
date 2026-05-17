import React, { useState, useEffect, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleList, ModuleListItem, ModuleModal } from '../../components/common/module/ModuleList'

interface Workflow { id: string; name: string; description: string; enabled: boolean; trigger: { type: string; cron?: string }; steps: unknown[]; createdAt: number; runCount: number }
interface WorkflowRun { id: string; workflowId: string; startedAt: number; status: string; error?: string }

export function WorkflowPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [logs, setLogs] = useState<WorkflowRun[]>([])
  const [activeTab, setActiveTab] = useState('list')
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
    try { await window.electronAPI.invoke('workflow_execute', { workflowId: id }); loadLogs() } catch { /* ignore */ }
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    try { await window.electronAPI.invoke('workflow_delete', { workflowId: id }); loadWorkflows() } catch { /* ignore */ }
  }

  const handleCreateFromTemplate = async (template: { name: string; desc: string; trigger: string }) => {
    try {
      const res = await window.electronAPI.invoke('workflow_create', { name: template.name, description: template.desc, trigger: { type: template.trigger } })
      if (res?.success) { setActiveTab('list'); loadWorkflows() }
    } catch { /* ignore */ }
  }

  const TRIGGER_LABELS: Record<string, string> = { manual: '手动', cron: '定时', event: '事件', hotkey: '快捷键' }

  return (
    <div className="mod-page">
      <ModuleHeader
        icon="🔄"
        title="工作流"
        tabs={[
          { key: 'list', label: '📋 工作流', count: workflows.length },
          { key: 'logs', label: '📜 执行日志' },
          { key: 'templates', label: '📦 模板' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        actions={activeTab === 'list' ? <button onClick={() => setShowCreate(true)} className="btn btn-primary">＋ 新建工作流</button> : undefined}
      />

      {/* 新建工作流弹窗 */}
      {showCreate && (
        <ModuleModal title="新建工作流" onClose={() => setShowCreate(false)} footer={
          <>
            <button className="btn" onClick={() => setShowCreate(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>创建</button>
          </>
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="工作流名称" className="mod-search" style={{ maxWidth: 'none' }} />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述（可选）" className="mod-search" style={{ maxWidth: 'none' }} />
            <select value={newTrigger} onChange={e => setNewTrigger(e.target.value)} style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, background: '#fff', fontSize: 13 }}>
              <option value="manual">手动触发</option>
              <option value="cron">定时触发</option>
              <option value="event">事件触发</option>
              <option value="hotkey">快捷键触发</option>
            </select>
            {newTrigger === 'cron' && <input value={newCron} onChange={e => setNewCron(e.target.value)} placeholder="Cron 表达式" className="mod-search" style={{ maxWidth: 'none' }} />}
          </div>
        </ModuleModal>
      )}

      {activeTab === 'list' && (
        <ModuleList emptyText="暂无工作流，点击上方按钮创建" emptyIcon="🔄">
          {workflows.map(wf => (
            <ModuleListItem
              key={wf.id}
              id={wf.id}
              icon={wf.enabled ? '🔄' : '⏸'}
              title={wf.name}
              subtitle={`${wf.description || '无描述'} · ${wf.steps.length} 步骤 · 执行 ${wf.runCount} 次`}
              badge={<span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: 'var(--color-accent)' }}>{TRIGGER_LABELS[wf.trigger.type] ?? wf.trigger.type}</span>}
              actions={
                <>
                  <button onClick={(e) => { e.stopPropagation(); handleExecute(wf.id) }} disabled={loading || !wf.enabled} className="btn-icon-lg" title="执行">▶</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(wf.id) }} className="btn-icon-lg" title="删除">🗑</button>
                </>
              }
            />
          ))}
        </ModuleList>
      )}

      {activeTab === 'logs' && (
        <ModuleList emptyText="暂无执行记录" emptyIcon="📜">
          {logs.map(log => (
            <ModuleListItem
              key={log.id}
              id={log.id}
              icon={log.status === 'success' ? '✅' : log.status === 'failed' ? '❌' : '⏳'}
              title={log.workflowId.slice(0, 8)}
              subtitle={new Date(log.startedAt).toLocaleString()}
              badge={log.error ? <span style={{ fontSize: 11, color: 'var(--color-error)' }}>{log.error}</span> : undefined}
            />
          ))}
        </ModuleList>
      )}

      {activeTab === 'templates' && (
        <ModuleList emptyText="" emptyIcon="">
          {[
            { name: '每日日报', desc: '聚合今日工作生成日报', trigger: 'cron' },
            { name: '文件备份', desc: '备份指定目录', trigger: 'cron' },
            { name: '代码审查', desc: 'AI审查当前文件', trigger: 'manual' },
          ].map((t, i) => (
            <ModuleListItem
              key={i}
              id={String(i)}
              icon="📦"
              title={t.name}
              subtitle={t.desc}
              badge={<span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: 'var(--color-accent)' }}>{TRIGGER_LABELS[t.trigger] ?? t.trigger}</span>}
              actions={<button onClick={(e) => { e.stopPropagation(); handleCreateFromTemplate(t) }} className="btn-icon-lg" title="使用模板">📥</button>}
            />
          ))}
        </ModuleList>
      )}
    </div>
  )
}
