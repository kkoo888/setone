/**
 * 技能更新弹窗
 * 联网时：显示可更新的技能列表，支持单个更新和全部更新
 * 断网时：提示用户开启网络
 */
import React, { useCallback, useState, useEffect } from 'react'
import { useSkillStore } from '../../../stores/useSkillStore'
import { useSettingsStore } from '../../../stores/useSettingsStore'
import { FolderOpen, Refresh, Plug, LoadingFour, CheckOne } from '../../../utils/statusMessages'
import type { UpdateInfo } from '../../../stores/useSkillStore'

/** 更新项属性 */
interface UpdateItemProps {
  info: UpdateInfo
  updating: boolean
  onUpdate: (skillId: string) => void
}

/** 单个更新项 */
function UpdateItem({ info, updating, onUpdate }: UpdateItemProps) {
  return (
    <div className='update-item'>
      <div className='update-item-info'>
        <span className='update-item-icon'>{folderI}</span>
        <div className='update-item-detail'>
          <h4 className='update-item-name'>{info.skillId}</h4>
          <p className='update-item-version'>
            <span className='version-current'>v{info.currentVersion}</span>
            <span className='version-arrow'>→</span>
            <span className='version-latest'>v{info.latestVersion}</span>
          </p>
          {info.changelog && (
            <p className='update-item-changelog'>{info.changelog}</p>
          )}
        </div>
      </div>
      <button
        className='btn-update-single'
        disabled={updating}
        onClick={() => onUpdate(info.skillId)}
      >
        {updating ? '更新中...' : '更新'}
      </button>
    </div>
  )
}

/** 更新弹窗组件 */
export function SkillUpdateDialog() {
  const {
    updateDialogOpen,
    setUpdateDialogOpen,
    updateList,
    installProgress,
    checkUpdates,
    updateSkill
  } = useSkillStore()

  const networkEnabled = useSettingsStore((s) => s.settings.networkEnabled)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)

  /** 打开时检查更新（仅联网状态） */
  useEffect(() => {
    if (updateDialogOpen) {
      if (networkEnabled) {
        setHasChecked(false)
        checkUpdates().then(() => setHasChecked(true))
      } else {
        setHasChecked(true)
      }
    }
  }, [updateDialogOpen, networkEnabled, checkUpdates])

  /** 关闭弹窗 */
  const handleClose = useCallback(() => {
    setUpdateDialogOpen(false)
    setUpdatingId(null)
    setBatchUpdating(false)
    setHasChecked(false)
  }, [setUpdateDialogOpen])

  /** 单个更新 */
  const handleUpdate = useCallback(async (skillId: string) => {
    setUpdatingId(skillId)
    await updateSkill(skillId)
    setUpdatingId(null)
  }, [updateSkill])

  /** 全部更新 */
  const handleUpdateAll = useCallback(async () => {
    setBatchUpdating(true)
    for (const info of updateList) {
      setUpdatingId(info.skillId)
      await updateSkill(info.skillId)
    }
    setUpdatingId(null)
    setBatchUpdating(false)
  }, [updateList, updateSkill])

  if (!updateDialogOpen) return null

  return (
    <div className='dialog-overlay' onClick={handleClose}>
      <div className='dialog-panel update-dialog' onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className='dialog-header'>
          <h2 className='dialog-title'>{refreshI} 技能更新</h2>
          <button className='dialog-close' onClick={handleClose}>✕</button>
        </div>

        {/* 内容区 */}
        <div className='update-list'>
          {/* 网络关闭提示 */}
          {!networkEnabled ? (
            <div className='update-empty'>
              <span className='update-empty-icon'>{plugI}</span>
              <span className='update-empty-text'>网络已关闭</span>
              <p className='update-empty-hint'>请先在设置中开启网络，再检查技能更新</p>
            </div>
          ) : !hasChecked ? (
            /* 正在检查中 */
            <div className='update-empty'>
              <span className='update-empty-icon'>{loadingI}</span>
              <span className='update-empty-text'>正在检查更新...</span>
            </div>
          ) : updateList.length === 0 ? (
            /* 全部最新 */
            <div className='update-empty'>
              <span className='update-empty-icon'>{checkI}</span>
              <span className='update-empty-text'>所有技能已是最新版本</span>
            </div>
          ) : (
            /* 可更新列表 */
            <>
              <div className='update-summary'>
                <span>发现 {updateList.length} 个技能有新版本</span>
              </div>
              {updateList.map((info) => (
                <UpdateItem
                  key={info.skillId}
                  info={info}
                  updating={updatingId === info.skillId}
                  onUpdate={handleUpdate}
                />
              ))}
            </>
          )}
        </div>

        {/* 底部操作 */}
        {networkEnabled && updateList.length > 0 && (
          <div className='update-actions'>
            <button
              className='btn-update-all'
              disabled={batchUpdating || !!installProgress}
              onClick={handleUpdateAll}
            >
              {batchUpdating ? (installProgress || '更新中...') : `🚀 全部更新（${updateList.length}）`}
            </button>
          </div>
        )}

        {/* 更新进度 */}
        {installProgress && (
          <div className='install-progress'>
            <span className='install-progress-icon'>{loadingSmI}</span>
            <span className='install-progress-text'>{installProgress}</span>
          </div>
        )}
      </div>
    </div>
  )
}
