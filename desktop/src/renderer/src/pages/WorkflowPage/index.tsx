import React, { useState, useEffect, useCallback } from 'react'
import { EMPTY_ICONS, STATUS_ICONS, ACTION_ICONS, Msg, Search, Read, Refresh, Clipboard, FolderOpen, Magic, PlayOne, PauseOne, CheckOne, CloseOne, LoadingFour, DeleteOne, Monitor } from '../../utils/statusMessages'
const searchI = React.createElement(Search, { size: 16, fill: 'currentColor', theme: 'outline' })
const readI = React.createElement(Read, { size: 16, fill: 'currentColor', theme: 'outline' })
const refreshI = React.createElement(Refresh, { size: 16, fill: 'currentColor', theme: 'outline' })
const clipI = React.createElement(Clipboard, { size: 16, fill: 'currentColor', theme: 'outline' })
const folderI = React.createElement(FolderOpen, { size: 16, fill: 'currentColor', theme: 'outline' })
const magicI = React.createElement(Magic, { size: 16, fill: 'currentColor', theme: 'outline' })
const playI = React.createElement(PlayOne, { size: 16, fill: 'currentColor', theme: 'outline' })
const pauseI = React.createElement(PauseOne, { size: 16, fill: 'currentColor', theme: 'outline' })
const delI = React.createElement(DeleteOne, { size: 14, fill: 'currentColor', theme: 'outline' })
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleList, ModuleListItem, ModuleModal } from '../../components/common/module/ModuleList'
import '../../styles/pages/workflow.css'

interface Workflow { id: string; name: string; description: string; enabled: boolean; trigger: { type: string; cron?: string }; steps: unknown[]; createdAt: number; runCount: number }
interface WorkflowRun { id: string; workflowId: string; startedAt: number; status: string; error?: string }

const TRIGGER_LABELS: Record<string, string> = { manual: '手动', cron: '定时', event: '事件', hotkey: '快捷键' }
const TRIGGER_ICONS: Record<string, string> = { manual: '👆', cron: '⏰', event: '⚡', hotkey: '⌨️' }

const TEMPLATES = [
  { name: '每日日报', desc: '聚合今日工作内容，自动生成日报', trigger: 'cron', icon: '📝' },
  { name: '文件备份', desc: '定时备份指定目录到目标位置', trigger: 'cron', icon: '💾' },
  { name: '代码审查', desc: 'AI 审查当前文件并给出优化建议', trigger: 'manual', icon: searchI },
  { name: '消息汇总', desc: '汇总今日未读消息生成摘要', trigger: 'cron', icon: '📬' },
  { name: '系统巡检', desc: '检查系统资源、模块状态、异常日志', trigger: 'cron', icon: React.createElement(Monitor, { size: 16, fill: 'currentColor', theme: 'outline' }) },
  { name: '知识整理', desc: '自动整理知识库中的碎片内容', trigger: 'manual', icon: readI },
]

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
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TEMPLATES[0] | null>(null)

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
      if (res?.success) { setShowCreate(false); setNewName(''); setNewDesc(''); setNewCron(''); loadWorkflows() }
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

  const handleCreateFromTemplate = (template: typeof TEMPLATES[0]) => {
    setSelectedTemplate(template)
  }

  const handleConfirmTemplate = async () => {
    if (!selectedTemplate) return
    try {
      const res = await window.electronAPI.invoke('workflow_create', { name: selectedTemplate.name, description: selectedTemplate.desc, trigger: { type: selectedTemplate.trigger } })
      if (res?.success) { setSelectedTemplate(null); setActiveTab('list'); loadWorkflows() }
    } catch { /* ignore */ }
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = Date.now()
    const diff = now - ts
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="mod-page">
      <ModuleHeader
        icon={refreshI}
        title="工作流"
        tabs={[
          { key: 'list', label: <>{clipI} 工作流</>, count: workflows.length },
          { key: 'logs', label: '📜 执行日志', count: logs.length },
          { key: 'templates', label: <>{folderI} 模板</> },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        actions={<button onClick={() => setShowCreate(true)} className={`btn btn-primary wf-create-btn ${activeTab === 'list' ? '' : 'hidden'}`}>＋ 新建工作流</button>}
      />

      {/* 新建工作流弹窗 */}
      {showCreate && (
        <div className="wf-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="wf-modal" onClick={e => e.stopPropagation()}>
            <div className="wf-modal-header">
              <h3>{magicI} 新建工作流</h3>
              <button className="wf-modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="wf-modal-body">
              <div className="wf-form-group">
                <label>名称</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="给工作流起个名字" className="wf-input" autoFocus />
              </div>
              <div className="wf-form-group">
                <label>描述</label>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="简单描述一下它的用途" className="wf-input" />
              </div>
              <div className="wf-form-group">
                <label>触发方式</label>
                <div className="wf-trigger-grid">
                  {Object.entries(TRIGGER_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      className={`wf-trigger-option ${newTrigger === key ? 'active' : ''}`}
                      onClick={() => setNewTrigger(key)}
                    >
                      <span className="wf-trigger-icon">{TRIGGER_ICONS[key]}</span>
                      <span className="wf-trigger-label">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {newTrigger === 'cron' && (
                <div className="wf-form-group">
                  <label>Cron 表达式</label>
                  <input value={newCron} onChange={e => setNewCron(e.target.value)} placeholder="0 9 * * 1-5（每工作日9点）" className="wf-input" />
                  <span className="wf-form-hint">分 时 日 月 周</span>
                </div>
              )}
            </div>
            <div className="wf-modal-footer">
              <button className="btn" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !newName.trim()}>
                {loading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'list' && (
        <ModuleList emptyText="还没有工作流，点击上方按钮创建" emptyIcon={EMPTY_ICONS.refresh}>
          {workflows.map(wf => (
            <ModuleListItem
              key={wf.id}
              id={wf.id}
              icon={wf.enabled ? refreshI : pauseI}
              title={wf.name}
              subtitle={
                <span className="wf-card-subtitle">
                  {wf.description || '无描述'}
                  <span className="wf-card-dot">·</span>
                  {wf.steps.length} 步骤
                  <span className="wf-card-dot">·</span>
                  执行 {wf.runCount} 次
                </span>
              }
              badge={
                <span className="wf-trigger-badge">
                  {TRIGGER_ICONS[wf.trigger.type]} {TRIGGER_LABELS[wf.trigger.type] ?? wf.trigger.type}
                </span>
              }
              actions={
                <>
                  <button onClick={(e) => { e.stopPropagation(); handleExecute(wf.id) }} disabled={loading || !wf.enabled} className="btn-icon-lg" title="执行">▶</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(wf.id) }} className="btn-icon-lg" title="删除">{delI}</button>
                </>
              }
            />
          ))}
        </ModuleList>
      )}

      {activeTab === 'logs' && (
        <div className="wf-logs-container">
          {logs.length === 0 ? (
            <div className="wf-empty">
              <span className="wf-empty-icon">📜</span>
              <span>暂无执行记录</span>
            </div>
          ) : (
            <div className="wf-log-list">
              {logs.map(log => (
                <div key={log.id} className="wf-log-item">
                  <div className={`wf-log-status wf-log-status-${log.status}`} />
                  <div className="wf-log-info">
                    <span className="wf-log-name">{log.workflowId.slice(0, 8)}</span>
                    <span className="wf-log-time">{formatTime(log.startedAt)}</span>
                    {log.error && <span className="wf-log-error">{log.error}</span>}
                  </div>
                  <span className={`wf-log-badge wf-log-badge-${log.status}`}>
                    {log.status === 'success' ? <>{STATUS_ICONS.success} 成功</> : log.status === 'failed' ? <>{STATUS_ICONS.error} 失败</> : <>{STATUS_ICONS.loading} 运行中</>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 模板详情弹窗 */}
      {selectedTemplate && (
        <div className="wf-modal-overlay" onClick={() => setSelectedTemplate(null)}>
          <div className="wf-modal" onClick={e => e.stopPropagation()}>
            <div className="wf-modal-header">
              <h3>{selectedTemplate.icon} {selectedTemplate.name}</h3>
              <button className="wf-modal-close" onClick={() => setSelectedTemplate(null)}>✕</button>
            </div>
            <div className="wf-modal-body">
              <div className="wf-template-detail">
                <div className="wf-template-detail-icon">{selectedTemplate.icon}</div>
                <div className="wf-template-detail-info">
                  <h4>{selectedTemplate.name}</h4>
                  <p>{selectedTemplate.desc}</p>
                  <div className="wf-template-detail-meta">
                    <span className="wf-trigger-badge">
                      {TRIGGER_ICONS[selectedTemplate.trigger]} {TRIGGER_LABELS[selectedTemplate.trigger]}触发
                    </span>
                  </div>
                </div>
              </div>
              <div className="wf-template-detail-steps">
                <label>包含步骤</label>
                <div className="wf-template-step-list">
                  <div className="wf-template-step"><span className="wf-step-num">1</span> 初始化配置</div>
                  <div className="wf-template-step"><span className="wf-step-num">2</span> 执行核心逻辑</div>
                  <div className="wf-template-step"><span className="wf-step-num">3</span> 生成结果报告</div>
                </div>
              </div>
            </div>
            <div className="wf-modal-footer">
              <button className="btn" onClick={() => setSelectedTemplate(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleConfirmTemplate}>使用此模板</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="wf-templates-grid">
          {TEMPLATES.map((t, i) => (
            <div key={i} className="wf-template-card" onClick={() => handleCreateFromTemplate(t)}>
              <div className="wf-template-icon">{t.icon}</div>
              <div className="wf-template-info">
                <h4 className="wf-template-name">{t.name}</h4>
                <p className="wf-template-desc">{t.desc}</p>
                <span className="wf-template-trigger">
                  {TRIGGER_ICONS[t.trigger]} {TRIGGER_LABELS[t.trigger]}
                </span>
              </div>
              <button className="wf-template-use-btn" onClick={(e) => { e.stopPropagation(); handleCreateFromTemplate(t) }}>使用</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
