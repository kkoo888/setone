/**
 * 网络开关组件
 * 一键断开所有外网访问，保护本地项目安全
 */
import React, { useCallback } from 'react'
import { useSettingsStore } from '../../../stores/useSettingsStore'

export function NetworkToggle() {
  const networkEnabled = useSettingsStore((s) => s.settings.networkEnabled)
  const setNetworkEnabled = useSettingsStore((s) => s.setNetworkEnabled)

  const handleToggle = useCallback(() => {
    setNetworkEnabled(!networkEnabled)
  }, [networkEnabled, setNetworkEnabled])

  return (
    <button
      className={`network-toggle ${networkEnabled ? 'network-toggle--on' : 'network-toggle--off'}`}
      onClick={handleToggle}
      title={networkEnabled ? '网络已开启 · 点击断网' : '网络已断开 · 点击恢复'}
      aria-label={networkEnabled ? '断开网络' : '恢复网络'}
      aria-pressed={networkEnabled}
    >
      <span className="network-toggle-track">
        <span className="network-toggle-thumb" />
      </span>
      <span className="network-toggle-label">{networkEnabled ? '联网' : '断网'}</span>
    </button>
  )
}
