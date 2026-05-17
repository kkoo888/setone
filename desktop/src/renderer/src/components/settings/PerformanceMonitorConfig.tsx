/**
 * 性能监控配置组件
 * 配置采集间隔、告警阈值等
 */
import React from 'react'
import type { PerformanceMonitorSettings } from '../../types/settings'
import { Toggle } from '../common/Toggle'
import { Slider } from '../common/Slider'

interface PerformanceMonitorConfigProps {
  /** 当前性能监控设置 */
  readonly config: PerformanceMonitorSettings
  /** 配置变更回调 */
  readonly onChange: (updates: Partial<PerformanceMonitorSettings>) => void
}

export function PerformanceMonitorConfig({ config, onChange }: PerformanceMonitorConfigProps) {
  return (
    <div className="perf-monitor-config">
      {/* 启用监控 */}
      <Toggle
        label="启用性能监控"
        checked={config.enabled}
        onChange={(checked) => onChange({ enabled: checked })}
      />

      {/* 采集间隔 */}
      <Slider
        label="采集间隔"
        value={config.interval / 1000}
        onChange={(v) => onChange({ interval: v * 1000 })}
        min={1}
        max={30}
        step={1}
        formatValue={(v) => `${v}s`}
        disabled={!config.enabled}
      />

      {/* CPU 告警阈值 */}
      <Slider
        label="CPU 告警阈值"
        value={config.cpuAlertThreshold}
        onChange={(v) => onChange({ cpuAlertThreshold: v })}
        min={50}
        max={100}
        step={5}
        formatValue={(v) => `${v}%`}
        disabled={!config.enabled}
      />

      {/* 内存告警阈值 */}
      <Slider
        label="内存告警阈值"
        value={config.memoryAlertThreshold}
        onChange={(v) => onChange({ memoryAlertThreshold: v })}
        min={50}
        max={100}
        step={5}
        formatValue={(v) => `${v}%`}
        disabled={!config.enabled}
      />

      {/* 状态栏显示 */}
      <Toggle
        label="在状态栏显示资源使用"
        checked={config.showInStatusBar}
        onChange={(checked) => onChange({ showInStatusBar: checked })}
        disabled={!config.enabled}
      />
    </div>
  )
}
