/**
 * 回收站弹窗
 * 展示已删除技能列表，支持恢复和永久删除
 */
import React, { useEffect, useCallback, useState } from 'react'
import { useSkillStore } from '../../../stores/useSkillStore'
import type { TrashItem } from '../../../stores/useSkillStore'

interface SkillTrashDialogProps {
  /** 关闭弹窗 */
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

/** 计算相对时间 */
function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return formatTime(timestamp)
}

export function SkillTrashDialog({ onClose }: SkillTrashDialogProps) {
  const { trash, trashLoading, loadTrash, restoreSkill, emptyTrash, permanentDelete } = useSkillStore()
  const [confirmAction, setConfirmAction] = useState<{ type: 'empty' | 'delete'; id?: string } | null>(null)
  const [operating, setOperating] = useState<string | null>(null)

  /** 加载回收站 */
  useEffect(() => {
    loadTrash()
  }, [loadTrash])

  /** 按 ESC 关闭 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmAction) {
          setConfirmAction(null)
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, confirmAction])

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

  /** 恢复技能 */
  const handleRestore = useCallback(async (id: string) => {
    setOperating(id)
    try {
      await restoreSkill(id)
    } finally {
      setOperating(null)
    }
  }, [restoreSkill])

  /** 永久删除（需确认） */
  const handlePermanentDelete = useCallback((id: string) => {
    setConfirmAction({ type: 'delete', id })
  }, [])

  /** 清空回收站（需确认） */
  const handleEmptyTrash = useCallback(() => {
    setConfirmAction({ type: 'empty' })
  }, [])

  /** 执行确认操作 */
  const handleConfirm = useCallback(async () => {
    if (!confirmAction) return
    setOperating(confirmAction.id ?? '__empty__')
    try {
      if (confirmAction.type === 'empty') {
        await emptyTrash()
      } else if (confirmAction.id) {
        await permanentDelete(confirmAction.id)
      }
    } finally {
      setOperating(null)
      setConfirmAction(null)
    }
  }, [confirmAction, emptyTrash, permanentDelete])

  /** 取消确认 */
  const handleCancelConfirm = useCallback(() => {
    setConfirmAction(null)
  }, [])

  return (
    <div className='skill-trash-overlay' onClick={handleOverlayClick} role='dialog' aria-modal='true' aria-label='回收站'>
      <div className='skill-trash-dialog'>
        {/* 头部 */}
        <div className='skill-trash-header'>
          <div className='skill-trash-header-left'>
            <span className='skill-trash-icon' aria-hidden='true'>🗑️</span>
            <h2 className='skill-trash-title'>回收站</h2>
            <span className='skill-trash-count'>{trash.length} 个技能</span>
          </div>
          <button className='skill-trash-close' onClick={onClose} aria-label='关闭回收站'>
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className='skill-trash-body'>
          {trashLoading ? (
            <div className='skill-trash-empty'>
              <span className='skill-trash-empty-icon'>⏳</span>
              <span className='skill-trash-empty-text'>加载中...</span>
            </div>
          ) : trash.length === 0 ? (
            <div className='skill-trash-empty'>
              <span className='skill-trash-empty-icon'>✨</span>
              <span className='skill-trash-empty-text'>回收站是空的</span>
            </div>
          ) : (
            <div className='skill-trash-list'>
              {trash.map((item: TrashItem) => (
                <div key={item.id} className='skill-trash-item'>
                  <div className='skill-trash-item-info'>
                    <span className='skill-trash-item-id'>{item.id}</span>
                    <span className='skill-trash-item-time' title={formatTime(item.deletedAt)}>
                      {relativeTime(item.deletedAt)}
                    </span>
                  </div>
                  <div className='skill-trash-item-actions'>
                    <button
                      className='skill-trash-btn skill-trash-btn--restore'
                      onClick={() => handleRestore(item.id)}
                      disabled={operating === item.id}
                      title='恢复技能'
                    >
                      {operating === item.id ? '⏳' : '♻️'} 恢复
                    </button>
                    <button
                      className='skill-trash-btn skill-trash-btn--delete'
                      onClick={() => handlePermanentDelete(item.id)}
                      disabled={operating === item.id}
                      title='永久删除'
                    >
                      {operating === item.id ? '⏳' : '🗑️'} 删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部 */}
        {trash.length > 0 && (
          <div className='skill-trash-footer'>
            <button
              className='skill-trash-btn skill-trash-btn--empty'
              onClick={handleEmptyTrash}
              disabled={operating !== null}
            >
              清空回收站
            </button>
          </div>
        )}

        {/* 确认弹窗 */}
        {confirmAction && (
          <div className='skill-trash-confirm-overlay'>
            <div className='skill-trash-confirm'>
              <p className='skill-trash-confirm-text'>
                {confirmAction.type === 'empty'
                  ? `确定清空回收站？将永久删除 ${trash.length} 个技能，此操作不可撤销。`
                  : `确定永久删除技能 "${confirmAction.id}"？此操作不可撤销。`}
              </p>
              <div className='skill-trash-confirm-actions'>
                <button
                  className='skill-trash-btn skill-trash-btn--cancel'
                  onClick={handleCancelConfirm}
                  disabled={operating !== null}
                >
                  取消
                </button>
                <button
                  className='skill-trash-btn skill-trash-btn--danger'
                  onClick={handleConfirm}
                  disabled={operating !== null}
                >
                  {operating !== null ? '处理中...' : '确认删除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
