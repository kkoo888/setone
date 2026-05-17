/**
 * 语言选择组件
 * 支持多语言切换
 */
import React from 'react'
import type { Language } from '../../types/settings'

interface LanguageSelectorProps {
  /** 当前语言 */
  readonly language: Language
  /** 语言变更回调 */
  readonly onChange: (language: Language) => void
}

/** 支持的语言列表 */
const LANGUAGE_OPTIONS: ReadonlyArray<{ value: Language; label: string; nativeLabel: string }> = [
  { value: 'zh-CN', label: '简体中文', nativeLabel: '简体中文' },
  { value: 'en-US', label: 'English', nativeLabel: 'English' },
  { value: 'ja-JP', label: '日本語', nativeLabel: '日本語' },
]

export function LanguageSelector({ language, onChange }: LanguageSelectorProps) {
  return (
    <div className="language-selector">
      <select
        className="settings-select"
        value={language}
        onChange={(e) => onChange(e.target.value as Language)}
      >
        {LANGUAGE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.nativeLabel}
          </option>
        ))}
      </select>
    </div>
  )
}
