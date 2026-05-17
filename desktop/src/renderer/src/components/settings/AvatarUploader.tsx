import React, { useRef, useState, useCallback } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { AvatarEditor } from './AvatarEditor'

/** 允许的图片 MIME 类型 */
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/** 最大原始文件大小 10MB（裁剪前） */
const MAX_INPUT_BYTES = 10 * 1024 * 1024

export function AvatarUploader() {
  const avatar = useSettingsStore((s) => s.settings.avatar)
  const setAvatar = useSettingsStore((s) => s.setAvatar)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editingImage, setEditingImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** 触发文件选择 */
  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  /** 处理文件选择 */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('请选择 jpg、png、webp 或 gif 格式的图片')
      return
    }

    if (file.size > MAX_INPUT_BYTES) {
      setError('图片大小不能超过 10MB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditingImage(reader.result)
      }
    }
    reader.onerror = () => {
      setError('读取文件失败，请重试')
    }
    reader.readAsDataURL(file)

    // 清空 input 以便重复选择同一文件
    e.target.value = ''
  }, [])

  /** 裁剪确认 */
  const handleCropConfirm = useCallback((dataUrl: string) => {
    setAvatar(dataUrl)
    setEditingImage(null)
    setError(null)
  }, [setAvatar])

  /** 裁剪取消 */
  const handleCropCancel = useCallback(() => {
    setEditingImage(null)
  }, [])

  /** 清除头像 */
  const handleClear = useCallback(() => {
    setAvatar('')
  }, [setAvatar])

  return (
    <div className="avatar-uploader">
      <div className="avatar-uploader-row">
        <div
          className="avatar-uploader-preview"
          onClick={handleClick}
          role="button"
          tabIndex={0}
          aria-label="更换头像"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
        >
          {avatar ? (
            <img src={avatar} alt="自定义头像" className="avatar-uploader-img" />
          ) : (
            <span className="avatar-uploader-emoji">🌸</span>
          )}
          <div className="avatar-uploader-hover">更换</div>
        </div>

        <div className="avatar-uploader-info">
          <span className="avatar-uploader-title">助手头像</span>
          <span className="avatar-uploader-hint">
            支持 jpg、png、webp、gif 格式
          </span>
          <div className="avatar-uploader-actions">
            <button className="btn btn-secondary btn-sm" onClick={handleClick}>
              选择图片
            </button>
            {avatar && (
              <button className="btn btn-ghost btn-sm" onClick={handleClear}>
                恢复默认
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="avatar-uploader-error">{error}</div>}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleFileChange}
        className="avatar-uploader-input"
        aria-hidden="true"
      />

      {editingImage && (
        <AvatarEditor
          imageSrc={editingImage}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}
