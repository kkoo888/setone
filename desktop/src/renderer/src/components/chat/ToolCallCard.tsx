import React, { useState } from 'react'

export interface ToolCallData {
  id: string
  name: string
  arguments?: Record<string, unknown>
  result?: unknown
  error?: string
  status?: 'running' | 'success' | 'error'
  durationMs?: number
}

interface Props extends ToolCallData {}

export function ToolCallCard({ name, arguments: args, result, error, status = 'success', durationMs }: Props) {
  const [expanded, setExpanded] = useState(false)
  const statusConfig = { running: { icon: '⏳', label: '执行中…', color: 'var(--color-warning, #f59e0b)' }, success: { icon: '✅', label: '完成', color: 'var(--color-success, #10b981)' }, error: { icon: '❌', label: '失败', color: 'var(--color-error, #ef4444)' } }[status]
  const hasDetails = args && Object.keys(args).length > 0
  return (
    <div className={`tool-call-card tool-call-${status}`}>
      <button className="tool-call-header" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-label={`${name} - ${statusConfig.label}`}>
        <span className="tool-call-icon" style={{ color: statusConfig.color }}>{statusConfig.icon}</span>
        <span className="tool-call-name">{name}</span>
        {durationMs != null && <span className="tool-call-duration">{durationMs}ms</span>}
        {status === 'running' && <span className="tool-call-spinner" aria-hidden="true"><span className="spinner" /></span>}
        <span className="tool-call-toggle">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="tool-call-body">
          {hasDetails && <details className="tool-call-args"><summary>参数</summary><pre>{JSON.stringify(args, null, 2)}</pre></details>}
          {status === 'success' && result !== undefined && <div className="tool-call-result"><div className="tool-call-result-label">结果</div><pre>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre></div>}
          {status === 'error' && <div className="tool-call-error"><div className="tool-call-error-label">错误</div><pre>{error ?? '未知错误'}</pre></div>}
          {status === 'running' && <div className="tool-call-running-hint">正在执行，请稍候…</div>}
        </div>
      )}
    </div>
  )
}
