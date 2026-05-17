/**
 * 生成新技能弹窗
 * 用户输入描述，AI 生成技能内容，支持预览和编辑
 */
import React, { useState, useCallback, useEffect } from 'react'
import { useSkillStore } from '../../../stores/useSkillStore'

interface SkillCreateDialogProps {
  onClose: () => void
}

type CreateStep = 'input' | 'preview'

export default function SkillCreateDialog({ onClose }: SkillCreateDialogProps) {
  const { createSkill } = useSkillStore()

  const [step, setStep] = useState<CreateStep>('input')
  const [description, setDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 生成预览内容
  const [previewContent, setPreviewContent] = useState('')
  const [skillId, setSkillId] = useState('')
  const [files, setFiles] = useState<string[]>([])

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

  /** AI 生成 */
  const handleGenerate = useCallback(async () => {
    if (!description.trim()) {
      setError('请描述你想要的技能功能')
      return
    }
    setError(null)
    setGenerating(true)

    try {
      const result = await window.electronAPI.invoke('skill:create', {
        name: description.slice(0, 30),
        description: description,
        tags: ['自定义'],
        permissions: [],
        aiInstruction: description
      })

      const res = result as {
        success?: boolean
        data?: {
          id?: string
          path?: string
        }
        error?: string
      }

      if (res?.success && res.data) {
        setSkillId(res.data.id ?? '')

        // 读取生成的 SKILL.md 内容
        try {
          const content = await window.electronAPI.invoke('file:read', {
            path: `${res.data.path}/SKILL.md`
          })
          const readRes = content as { success?: boolean; data?: string }
          if (readRes?.success && readRes.data) {
            setPreviewContent(readRes.data)
          } else {
            setPreviewContent('# 生成的技能\n\n> ' + description)
          }
        } catch {
          setPreviewContent('# 生成的技能\n\n> ' + description)
        }

        setFiles(['SKILL.md'])
        setStep('preview')
      } else {
        setError(res?.error ?? '生成失败，请重试')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`生成失败: ${message}`)
    } finally {
      setGenerating(false)
    }
  }, [description])

  /** 保存技能 */
  const handleSave = useCallback(async () => {
    // 保存编辑后的内容
    if (skillId && previewContent) {
      try {
        // 获取技能路径并写入
        const listResult = await window.electronAPI.invoke('skill:list')
        const skills = Array.isArray(listResult) ? listResult : (listResult as { data?: unknown[] })?.data ?? []
        const skill = (skills as Array<{ id?: string; path?: string }>).find((s) => s.id === skillId)

        if (skill?.path) {
          await window.electronAPI.invoke('file:write', {
            path: `${skill.path}/SKILL.md`,
            content: previewContent
          })
        }
      } catch (err) {
        console.error('[SkillCreateDialog] 保存 SKILL.md 失败:', err)
      }
    }

    // 刷新技能列表
    await useSkillStore.getState().loadSkills()
    onClose()
  }, [skillId, previewContent, onClose])

  /** 重新输入 */
  const handleBack = useCallback(() => {
    setStep('input')
    setPreviewContent('')
    setSkillId('')
    setFiles([])
    setError(null)
  }, [])

  return (
    <div className='skill-create-overlay' onClick={handleOverlayClick} role='dialog' aria-modal='true' aria-label='生成新技能'>
      <div className='skill-create-dialog'>
        {/* 头部 */}
        <div className='skill-create-header'>
          <div className='skill-create-header-left'>
            <span className='skill-create-icon' aria-hidden='true'>✨</span>
            <h2 className='skill-create-title'>
              {step === 'input' ? '生成新技能' : '预览生成结果'}
            </h2>
          </div>
          <button className='skill-create-close' onClick={onClose} aria-label='关闭'>
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className='skill-create-body'>
          {step === 'input' ? (
            <>
              {/* 输入步骤 */}
              <div className='skill-create-input-section'>
                <label className='skill-create-label'>
                  描述你想要的技能功能
                  <span className='skill-create-hint'>
                    AI 将根据你的描述自动生成 SKILL.md 和代码骨架
                  </span>
                </label>
                <textarea
                  className='skill-create-textarea'
                  placeholder='例如：创建一个自动整理下载文件夹的技能，按文件类型分类移动到对应目录...'
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    setError(null)
                  }}
                  rows={6}
                  autoFocus
                />
                {error && <p className='skill-create-error'>{error}</p>}
              </div>
            </>
          ) : (
            <>
              {/* 预览步骤 */}
              <div className='skill-create-preview-section'>
                {skillId && (
                  <div className='skill-create-meta'>
                    <span className='skill-create-meta-id'>ID: {skillId}</span>
                    {files.length > 0 && (
                      <span className='skill-create-meta-files'>
                        文件: {files.join(', ')}
                      </span>
                    )}
                  </div>
                )}
                <label className='skill-create-label'>
                  SKILL.md 内容
                  <span className='skill-create-hint'>可编辑后保存</span>
                </label>
                <textarea
                  className='skill-create-preview-editor'
                  value={previewContent}
                  onChange={(e) => setPreviewContent(e.target.value)}
                  rows={16}
                />
              </div>
            </>
          )}
        </div>

        {/* 底部操作 */}
        <div className='skill-create-footer'>
          {step === 'input' ? (
            <>
              <button className='skill-create-btn skill-create-btn--cancel' onClick={onClose}>
                取消
              </button>
              <button
                className='skill-create-btn skill-create-btn--generate'
                onClick={handleGenerate}
                disabled={generating || !description.trim()}
              >
                {generating ? '⏳ AI 生成中...' : '✨ AI 生成'}
              </button>
            </>
          ) : (
            <>
              <button className='skill-create-btn skill-create-btn--back' onClick={handleBack}>
                ← 重新描述
              </button>
              <button className='skill-create-btn skill-create-btn--save' onClick={handleSave}>
                💾 保存技能
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
