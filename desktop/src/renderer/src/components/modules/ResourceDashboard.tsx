/**
 * 资源监控仪表盘组件
 * 展示系统 CPU、内存、磁盘使用率
 */
import React from 'react'

/** 资源快照数据 */
export interface ResourceSnapshot {
  /** CPU 使用率（百分比） */
  readonly cpu: number
  /** 内存使用率（百分比） */
  readonly memory: number
  /** 磁盘使用率（百分比） */
  readonly disk: number
  /** GPU 使用率（百分比，可选） */
  readonly gpu?: number
  /** 时间戳 */
  readonly timestamp: number
}

interface ResourceDashboardProps {
  /** 资源快照 */
  readonly snapshot: ResourceSnapshot | null
  /** 是否正在加载 */
  readonly loading?: boolean
}

/** 获取使用率对应的颜色等级 */
function getUsageColor(percent: number): string {
  if (percent >= 90) return 'critical'
  if (percent >= 70) return 'warning'
  return 'normal'
}

/** 资源指标项 */
function ResourceMeter({ label, value, unit = '%' }: { label: string; value: number; unit?: string }) {
  const colorClass = getUsageColor(value)
  return (
    <div className="resource-meter">
      <div className="resource-meter-header">
        <span className="resource-meter-label">{label}</span>
        <span className={`resource-meter-value resource-${colorClass}`}>
          {value.toFixed(1)}{unit}
        </span>
      </div>
      <div className="resource-meter-bar">
        <div
          className={`resource-meter-fill resource-fill-${colorClass}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  )
}

export function ResourceDashboard({ snapshot, loading }: ResourceDashboardProps) {
  if (loading) {
    return (
      <div className="resource-dashboard">
        <div className="resource-dashboard-loading">加载中...</div>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="resource-dashboard">
        <div className="resource-dashboard-empty">暂无资源数据</div>
      </div>
    )
  }

  return (
    <div className="resource-dashboard">
      <h4 className="resource-dashboard-title">系统资源</h4>
      <div className="resource-dashboard-grid">
        <ResourceMeter label="CPU" value={snapshot.cpu} />
        <ResourceMeter label="内存" value={snapshot.memory} />
        <ResourceMeter label="磁盘" value={snapshot.disk} />
        {snapshot.gpu !== undefined && (
          <ResourceMeter label="GPU" value={snapshot.gpu} />
        )}
      </div>
    </div>
  )
}
