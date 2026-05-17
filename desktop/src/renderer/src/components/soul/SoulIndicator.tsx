/**
 * SOUL 指示器组件
 * 在界面角落显示当前助手人格状态
 */

import React from 'react'
import { useSoulStore } from '../../stores/useSoulStore'

interface SoulIndicatorProps {
  /** 是否显示名称 */
  showName?: boolean
  /** 点击回调（打开设置等） */
  onClick?: () => void
}

/**
 * SOUL 指示器
 * 显示当前助手的 emoji + 名称
 */
export const SoulIndicator: React.FC<SoulIndicatorProps> = ({ showName = true, onClick }) => {
  const { soul, status } = useSoulStore()

  if (status !== 'ready' || !soul) return null

  return (
    <button
      className="soul-indicator"
      onClick={onClick}
      title={`${soul.name} - ${soul.personality.speakingStyle}`}
    >
      <span className="soul-indicator-emoji">{soul.emoji}</span>
      {showName && <span className="soul-indicator-name">{soul.name}</span>}
    </button>
  )
}

export default SoulIndicator
