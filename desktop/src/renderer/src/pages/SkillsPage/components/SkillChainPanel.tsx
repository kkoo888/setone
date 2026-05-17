/**
 * 技能组合/工作流面板
 * 侧滑弹窗，管理工作流的创建、编辑、执行和查看
 */
import React, { useEffect, useCallback, useState, useMemo } from 'react'
import { useSkillStore } from '../../../stores/useSkillStore'
import type { SkillMeta } from '../../../stores/useSkillStore'

/** 工作流步骤 */
interface WorkflowStep {
  skillId: string
  params?: Record<string, unknown>
  condition?: string
}

/** 工作流定义 */
interface SkillWorkflow {
  id: string
  name: string
  description: string
  steps: WorkflowStep[]
  createdAt: number
}

interface SkillChainPanelProps {
  onClose: () => void
}

/** 格式化时间戳 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

export default function SkillChainPanel({ onClose }: SkillChainPanelProps) {
  const { skills, loadWorkflows, workflows, createWorkflow, executeWorkflow } = useSkillStore()

  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedWorkflow, setSelectedWorkflow] = useState<SkillWorkflow | null>(null)

  // 创建工作流表单状态
  const [wfName, setWfName] = useState('')
  const [wfDesc, setWfDesc] = useState('')
  const [wfSteps, setWfSteps] = useState<WorkflowStep[]>([])
  const [creating, setCreating] = useState(false)

  // 执行状态
  const [executing, setExecuting] = useState(false)
  const [execResult, setExecResult] = useState<{ success: boolean; results: unknown[] } | null>(null)

  // 已激活的技能列表
  const activeSkills = useMemo(
    () => skills.filter((s) => s.active),
    [skills]
  )

  /** 加载工作流列表 */
  useEffect(() => {
    loadWorkflows()
  }, [loadWorkflows])

  /** 按 ESC 关闭 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  /** 阻止背景滚动 */
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  /** 点击遮罩关闭 */
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose]
  )

  /** 添加步骤 */
  const addStep = useCallback(() => {
    if (activeSkills.length === 0) return
    setWfSteps((prev) => [...prev, { skillId: activeSkills[0].id }])
  }, [activeSkills])

  /** 移除步骤 */
  const removeStep = useCallback((index: number) => {
    setWfSteps((prev) => prev.filter((_, i) => i !== index))
  }, [])

  /** 上移步骤 */
  const moveStepUp = useCallback((index: number) => {
    if (index === 0) return
    setWfSteps((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }, [])

  /** 下移步骤 */
  const moveStepDown = useCallback((index: number) => {
    setWfSteps((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }, [])

  /** 更新步骤的技能 */
  const updateStepSkill = useCallback((index: number, skillId: string) => {
    setWfSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, skillId } : s))
    )
  }, [])

  /** 保存工作流 */
  const handleSave = useCallback(async () => {
    if (!wfName.trim() || wfSteps.length === 0) return
    setCreating(true)
    try {
      const ok = await createWorkflow(wfName.trim(), wfSteps)
      if (ok) {
        setWfName('')
        setWfDesc('')
        setWfSteps([])
        setView('list')
      }
    } finally {
      setCreating(false)
    }
  }, [wfName, wfSteps, createWorkflow])

  /** 执行工作流 */
  const handleExecute = useCallback(async (id: string) => {
    setExecuting(true)
    setExecResult(null)
    try {
      const ok = await executeWorkflow(id)
      setExecResult({ success: ok, results: [] })
    } finally {
      setExecuting(false)
    }
  }, [executeWorkflow])

  /** 获取技能名称 */
  const getSkillName = useCallback((skillId: string): string => {
    return skills.find((s) => s.id === skillId)?.name ?? skillId
  }, [skills])

  /** 获取技能图标 */
  const getSkillIcon = useCallback((skillId: string): string => {
    return skills.find((s) => s.id === skillId)?.icon ?? '📦'
  }, [skills])

  return (
    <div className='skill-config-overlay' onClick={handleOverlayClick} role='dialog' aria-modal='true' aria-label='技能组合面板'>
      <div className='skill-config-panel' style={{ width: '560px' }}>
        {/* 头部 */}
        <div className='skill-config-header'>
          <div className='skill-config-header-left'>
            <span className='skill-config-icon' aria-hidden='true'>🔗</span>
            <div>
              <h2 className='skill-config-title'>
                {view === 'create' ? '新建工作流' : view === 'detail' ? selectedWorkflow?.name : '技能组合'}
              </h2>
              <span className='skill-config-subtitle'>
                {view === 'list' ? `${workflows.length} 个工作流` : view === 'create' ? '配置步骤并保存' : '工作流详情'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {view !== 'list' && (
              <button
                className='skill-config-close'
                onClick={() => { setView('list'); setExecResult(null) }}
                aria-label='返回列表'
                style={{ fontSize: '14px', width: '32px', height: '32px' }}
              >
                ←
              </button>
            )}
            <button className='skill-config-close' onClick={onClose} aria-label='关闭'>
              ✕
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div className='skill-config-body'>
          {/* 列表视图 */}
          {view === 'list' && (
            <>
              <button
                className='skill-config-btn skill-config-btn--save'
                onClick={() => setView('create')}
                style={{ width: '100%', marginBottom: '16px' }}
              >
                + 新建工作流
              </button>

              {workflows.length === 0 ? (
                <div className='skill-config-empty'>
                  <span>🔗</span>
                  <span>暂无工作流，点击上方按钮创建</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {workflows.map((wf) => (
                    <div
                      key={wf.id}
                      className='skill-config-field'
                      style={{ cursor: 'pointer', padding: '12px' }}
                      onClick={() => { setSelectedWorkflow(wf); setView('detail') }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{wf.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #888)', marginTop: '4px' }}>
                            {wf.steps.length} 个步骤 · {formatTime(wf.createdAt)}
                          </div>
                        </div>
                        <span style={{ fontSize: '18px' }}>→</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 创建视图 */}
          {view === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className='skill-config-field'>
                <label className='skill-config-field-label'>工作流名称</label>
                <input
                  className='skill-config-input'
                  type='text'
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  placeholder='输入工作流名称'
                />
              </div>

              <div className='skill-config-field'>
                <label className='skill-config-field-label'>描述（可选）</label>
                <input
                  className='skill-config-input'
                  type='text'
                  value={wfDesc}
                  onChange={(e) => setWfDesc(e.target.value)}
                  placeholder='简要描述工作流用途'
                />
              </div>

              <div className='skill-config-field'>
                <label className='skill-config-field-label'>执行步骤</label>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #888)', marginBottom: '8px' }}>
                  按顺序执行，每步输出作为下一步输入
                </div>

                {wfSteps.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-secondary, #888)', fontSize: '13px' }}>
                    暂无步骤，点击下方添加
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {wfSteps.map((step, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          background: 'var(--color-bg-secondary, #f5f5f5)',
                          borderRadius: '8px',
                          fontSize: '13px'
                        }}
                      >
                        <span style={{ color: 'var(--color-text-secondary, #888)', fontSize: '12px', minWidth: '20px' }}>
                          {index + 1}.
                        </span>
                        <span style={{ fontSize: '16px' }}>{getSkillIcon(step.skillId)}</span>
                        <select
                          className='skill-config-select'
                          value={step.skillId}
                          onChange={(e) => updateStepSkill(index, e.target.value)}
                          style={{ flex: 1, fontSize: '13px' }}
                        >
                          {activeSkills.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => moveStepUp(index)}
                          disabled={index === 0}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: index === 0 ? 'default' : 'pointer',
                            opacity: index === 0 ? 0.3 : 1,
                            fontSize: '14px',
                            padding: '2px 4px'
                          }}
                          title='上移'
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveStepDown(index)}
                          disabled={index === wfSteps.length - 1}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: index === wfSteps.length - 1 ? 'default' : 'pointer',
                            opacity: index === wfSteps.length - 1 ? 0.3 : 1,
                            fontSize: '14px',
                            padding: '2px 4px'
                          }}
                          title='下移'
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeStep(index)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '14px',
                            padding: '2px 4px',
                            color: '#e74c3c'
                          }}
                          title='移除'
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={addStep}
                  disabled={activeSkills.length === 0}
                  style={{
                    marginTop: '8px',
                    padding: '8px 16px',
                    background: 'var(--color-bg-secondary, #f0f0f0)',
                    border: '1px dashed var(--color-border, #ddd)',
                    borderRadius: '8px',
                    cursor: activeSkills.length > 0 ? 'pointer' : 'not-allowed',
                    fontSize: '13px',
                    width: '100%',
                    opacity: activeSkills.length > 0 ? 1 : 0.5
                  }}
                >
                  + 添加步骤
                </button>
                {activeSkills.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#e74c3c', marginTop: '4px' }}>
                    没有已激活的技能，请先激活至少一个技能
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 详情视图 */}
          {view === 'detail' && selectedWorkflow && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedWorkflow.description && (
                <div className='skill-config-field'>
                  <label className='skill-config-field-label'>描述</label>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-secondary, #888)' }}>
                    {selectedWorkflow.description}
                  </div>
                </div>
              )}

              <div className='skill-config-field'>
                <label className='skill-config-field-label'>执行步骤</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedWorkflow.steps.map((step, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        background: 'var(--color-bg-secondary, #f5f5f5)',
                        borderRadius: '8px'
                      }}
                    >
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--color-primary, #4a90d9)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600
                      }}>
                        {index + 1}
                      </span>
                      <span style={{ fontSize: '16px' }}>{getSkillIcon(step.skillId)}</span>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>{getSkillName(step.skillId)}</span>
                      {step.condition && (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #888)', marginLeft: 'auto' }}>
                          条件: {step.condition}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 执行结果 */}
              {execResult && (
                <div className='skill-config-field'>
                  <label className='skill-config-field-label'>执行结果</label>
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: execResult.success ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)',
                    border: `1px solid ${execResult.success ? 'rgba(46, 204, 113, 0.3)' : 'rgba(231, 76, 60, 0.3)'}`,
                    fontSize: '13px'
                  }}>
                    {execResult.success ? '✅ 执行成功' : '❌ 执行失败'}
                    {execResult.results.length > 0 && (
                      <pre style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: '200px',
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(execResult.results, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #888)' }}>
                创建于 {formatTime(selectedWorkflow.createdAt)}
              </div>
            </div>
          )}
        </div>

        {/* 底部 */}
        {view === 'create' && (
          <div className='skill-config-footer'>
            <button
              className='skill-config-btn skill-config-btn--cancel'
              onClick={() => { setView('list'); setWfName(''); setWfDesc(''); setWfSteps([]) }}
            >
              取消
            </button>
            <button
              className='skill-config-btn skill-config-btn--save'
              onClick={handleSave}
              disabled={creating || !wfName.trim() || wfSteps.length === 0}
            >
              {creating ? '保存中...' : '保存'}
            </button>
          </div>
        )}

        {view === 'detail' && selectedWorkflow && (
          <div className='skill-config-footer'>
            <button
              className='skill-config-btn skill-config-btn--cancel'
              onClick={async () => {
                const ok = await useSkillStore.getState().deleteWorkflow(selectedWorkflow.id)
                if (ok) {
                  setView('list')
                  setSelectedWorkflow(null)
                }
              }}
              style={{ color: '#e74c3c' }}
            >
              删除
            </button>
            <button
              className='skill-config-btn skill-config-btn--save'
              onClick={() => handleExecute(selectedWorkflow.id)}
              disabled={executing}
            >
              {executing ? '执行中...' : '▶ 执行'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
