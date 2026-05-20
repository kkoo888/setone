/**
 * 状态栏组件
 * 显示系统资源使用情况（CPU、内存）
 * 仅在设置开启时显示
 */
import React, { useState, useEffect, useRef } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { Monitor, FolderOpen } from '../../utils/statusMessages'
import { registerPolling, unregisterPolling, tickPolling } from '../../utils/polling-helper'

/** 资源快照 */
interface ResourceSnapshot {
  cpu: number
  memory: number
  memoryUsedMB: number
  memoryTotalMB: number
}

export function StatusBar() {
  const showInStatusBar = useSettingsStore(
    (s) => s.settings.performanceMonitor.showInStatusBar
  )
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!showInStatusBar) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setSnapshot(null)
      return
    }

    /** 获取资源数据 */
    const fetchSnapshot = async () => {
      try {
        const data = await window.electronAPI.invoke('performance:snapshot')
        setSnapshot(data as ResourceSnapshot)
      } catch {
        // 静默失败
      }
    }

    void fetchSnapshot()
    timerRef.current = setInterval(() => {
      fetchSnapshot()
      tickPolling('status-bar-resources', '正在读取 CPU/内存快照')
    }, 3000)

    // 注册到轮询注册中心
    registerPolling({
      id: 'status-bar-resources',
      module: '状态栏',
      description: '系统资源快照（CPU/内存）',
      intervalMs: 3000,
    })

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      unregisterPolling('status-bar-resources')
    }
  }, [showInStatusBar])

  if (!showInStatusBar || !snapshot) return null

  /** 获取颜色 */
  const getColor = (value: number): string => {
    if (value >= 90) return 'var(--color-error)'
    if (value >= 70) return 'var(--color-warning)'
    return 'var(--color-success)'
  }

  return (
    <div className="status-bar" role="status" aria-label="系统资源状态">
      <div className="status-bar-item" title={`CPU 使用率: ${snapshot.cpu}%`}>
        <span className="status-bar-icon">{React.createElement(Monitor, { size: 14, fill: 'currentColor', theme: 'outline' })}</span>
        <span className="status-bar-label">CPU</span>
        <span className="status-bar-value" style={{ color: getColor(snapshot.cpu) }}>
          {snapshot.cpu}%
        </span>
      </div>
      <div className="status-bar-divider" />
      <div className="status-bar-item" title={`内存: ${snapshot.memoryUsedMB}MB / ${snapshot.memoryTotalMB}MB`}>
        <span className="status-bar-icon">{React.createElement(FolderOpen, { size: 14, fill: 'currentColor', theme: 'outline' })}</span>
        <span className="status-bar-label">内存</span>
        <span className="status-bar-value" style={{ color: getColor(snapshot.memory) }}>
          {snapshot.memory}%
        </span>
        <span className="status-bar-detail">
          {snapshot.memoryUsedMB}/{snapshot.memoryTotalMB}MB
        </span>
      </div>
    </div>
  )
}
