/**
 * 技能导出弹窗
 * 支持选择技能、选择导出路径、导出进度显示
 */
import React, { useState, useCallback, useEffect } from 'react'
import { CheckOne, CloseOne } from '../../../utils/statusMessages'
import type { SkillMeta } from '../../../stores/useSkillStore'

/** 组件属性 */
interface SkillExportDialogProps {
  visible: boolean
  skills: SkillMeta[]
  onClose: () => void
}

/** 导出阶段 */
type ExportPhase = 'select' | 'exporting' | 'done' | 'error'

/**
 * 技能导出弹窗组件
 */
export function SkillExportDialog({ visible, skills, onClose }: SkillExportDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [phase, setPhase] = useState<ExportPhase>('select')
  const [outputPath, setOutputPath] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')

  /** 重置状态 */
  useEffect(() => {
    if (visible) {
      setSelectedIds(new Set())
      setPhase('select')
      setOutputPath('')
      setErrorMsg('')
    }
  }, [visible])

  /** 切换选中状态 */
  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  /** 全选/取消全选 */
  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === skills.length) {
        return new Set()
      }
      return new Set(skills.map((s) => s.id))
    })
  }, [skills])

  /** 选择导出路径并执行导出 */
  const handleExport = useCallback(async () => {
    if (selectedIds.size === 0) return

    setPhase('exporting')
    setErrorMsg('')

    try {
      const ids = Array.from(selectedIds)

      if (ids.length === 1) {
        const result = await window.electronAPI.invoke('skill:export', {
          id: ids[0]
        }) as { success?: boolean; data?: { filePath?: string }; error?: string }

        if (result?.success && result.data?.filePath) {
          setOutputPath(result.data.filePath)
          setPhase('done')
        } else {
          setErrorMsg(result?.error ?? '导出失败')
          setPhase('error')
        }
      } else {
        const result = await window.electronAPI.invoke('skill:export:batch', {
          ids
        }) as { success?: boolean; data?: { filePath?: string }; error?: string }

        if (result?.success && result.data?.filePath) {
          setOutputPath(result.data.filePath)
          setPhase('done')
        } else {
          setErrorMsg(result?.error ?? '批量导出失败')
          setPhase('error')
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }, [selectedIds])

  if (!visible) return null

  return (
    <div className='dialog-overlay' onClick={onClose}>
      <div className='dialog-panel' onClick={(e) => e.stopPropagation()}>
        <div className='dialog-header'>
          <h2>导出技能</h2>
          <button className='dialog-close' onClick={onClose}>✕</button>
        </div>

        <div className='dialog-body'>
          {phase === 'select' && (
            <>
              <p className='dialog-hint'>
                选择要导出的技能，导出后可分享给其他人导入使用。
              </p>

              <div className='skill-select-list'>
                <label className='skill-select-item skill-select-all'>
                  <input
                    type='checkbox'
                    checked={selectedIds.size === skills.length && skills.length > 0}
                    onChange={handleToggleAll}
                  />
                  <span>全选 ({selectedIds.size}/{skills.length})</span>
                </label>
                {skills.map((skill) => (
                  <label key={skill.id} className='skill-select-item'>
                    <input
                      type='checkbox'
                      checked={selectedIds.has(skill.id)}
                      onChange={() => handleToggle(skill.id)}
                    />
                    <span className='skill-select-name'>{skill.name}</span>
                    <span className='skill-select-version'>v{skill.version}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {phase === 'exporting' && (
            <div className='dialog-progress'>
              <div className='progress-spinner' />
              <p>正在导出 {selectedIds.size} 个技能...</p>
            </div>
          )}

          {phase === 'done' && (
            <div className='dialog-success'>
              <span className='success-icon'>{React.createElement(CheckOne, { size: 24, fill: '#10b981', theme: 'outline' })}</span>
              <p>导出成功！</p>
              <p className='output-path'>{outputPath}</p>
            </div>
          )}

          {phase === 'error' && (
            <div className='dialog-error'>
              <span className='error-icon'>{React.createElement(CloseOne, { size: 24, fill: '#ef4444', theme: 'outline' })}</span>
              <p>导出失败</p>
              <p className='error-detail'>{errorMsg}</p>
            </div>
          )}
        </div>

        <div className='dialog-footer'>
          {phase === 'select' && (
            <>
              <button className='btn btn-secondary' onClick={onClose}>取消</button>
              <button
                className='btn btn-primary'
                disabled={selectedIds.size === 0}
                onClick={handleExport}
              >
                导出 ({selectedIds.size})
              </button>
            </>
          )}
          {(phase === 'done' || phase === 'error') && (
            <button className='btn btn-primary' onClick={onClose}>关闭</button>
          )}
        </div>
      </div>
    </div>
  )
}
