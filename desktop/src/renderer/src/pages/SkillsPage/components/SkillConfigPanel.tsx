/**
 * 技能参数配置面板
 * 侧滑弹窗，根据技能的 config 字段动态生成表单
 * 支持：text input、number input、toggle、select、slider
 */
import React, { useEffect, useCallback, useState, useMemo } from 'react'
import { useSkillStore } from '../../../stores/useSkillStore'
import { SettingOne, LoadingFour, Inbox } from '@icon-park/react'
import type { SkillMeta } from '../../../stores/useSkillStore'

interface SkillConfigPanelProps {
  /** 技能元数据 */
  skill: SkillMeta
  /** 关闭面板 */
  onClose: () => void
}

/** 配置字段类型 */
type FieldType = 'text' | 'number' | 'toggle' | 'select' | 'slider'

/** 配置字段定义 */
interface ConfigFieldDef {
  /** 字段 key */
  key: string
  /** 显示标签 */
  label: string
  /** 字段类型 */
  type: FieldType
  /** 占位文本 */
  placeholder?: string
  /** 默认值 */
  defaultValue?: unknown
  /** select 选项 */
  options?: Array<{ label: string; value: unknown }>
  /** slider 最小值 */
  min?: number
  /** slider 最大值 */
  max?: number
  /** slider 步长 */
  step?: number
  /** 描述文本 */
  description?: string
}

/**
 * 尝试从技能 config 推断字段定义
 * 如果 config 中的值是对象且包含 type 字段，则视为 schema
 * 否则根据值类型自动推断
 */
function inferFields(config: Record<string, unknown>): ConfigFieldDef[] {
  const fields: ConfigFieldDef[] = []

  for (const [key, value] of Object.entries(config)) {
    // 跳过内部字段
    if (key.startsWith('_')) continue

    // 如果值是对象且包含 type 字段，视为字段定义
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && 'type' in (value as Record<string, unknown>)) {
      const def = value as Record<string, unknown>
      fields.push({
        key,
        label: String(def.label ?? key),
        type: String(def.type ?? 'text') as FieldType,
        placeholder: def.placeholder ? String(def.placeholder) : undefined,
        defaultValue: def.defaultValue,
        options: def.options as ConfigFieldDef['options'],
        min: typeof def.min === 'number' ? def.min : undefined,
        max: typeof def.max === 'number' ? def.max : undefined,
        step: typeof def.step === 'number' ? def.step : undefined,
        description: def.description ? String(def.description) : undefined
      })
      continue
    }

    // 根据值类型自动推断
    if (typeof value === 'boolean') {
      fields.push({ key, label: key, type: 'toggle', defaultValue: value })
    } else if (typeof value === 'number') {
      fields.push({ key, label: key, type: 'number', defaultValue: value })
    } else if (typeof value === 'string') {
      fields.push({ key, label: key, type: 'text', defaultValue: value })
    }
  }

  return fields
}

/** 格式化标签名 */
function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}

export function SkillConfigPanel({ skill, onClose }: SkillConfigPanelProps) {
  const { loadSkillConfig, saveSkillConfig } = useSkillStore()
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  /** 加载配置 */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const data = await loadSkillConfig(skill.id)
        if (!cancelled) {
          setConfig(data)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [skill.id, loadSkillConfig])

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

  /** 推断字段定义 */
  const fields = useMemo(() => inferFields(config), [config])

  /** 更新字段值 */
  const updateField = useCallback((key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }, [])

  /** 保存配置 */
  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaved(false)
    try {
      // 提取非 schema 字段的实际值
      const actualConfig: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(config)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value) && 'type' in (value as Record<string, unknown>)) {
          // schema 字段，取 defaultValue
          const def = value as Record<string, unknown>
          actualConfig[key] = def.defaultValue
        } else {
          actualConfig[key] = value
        }
      }
      const ok = await saveSkillConfig(skill.id, actualConfig)
      if (ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }, [config, skill.id, saveSkillConfig])

  return (
    <div className='skill-config-overlay' onClick={handleOverlayClick} role='dialog' aria-modal='true' aria-label={`${skill.name} 配置`}>
      <div className='skill-config-panel'>
        {/* 头部 */}
        <div className='skill-config-header'>
          <div className='skill-config-header-left'>
            <span className='skill-config-icon' aria-hidden='true'>{React.createElement(SettingOne, { size: 24, fill: '#9ca3af', theme: 'outline' })}</span>
            <div>
              <h2 className='skill-config-title'>{skill.name}</h2>
              <span className='skill-config-subtitle'>参数配置</span>
            </div>
          </div>
          <button className='skill-config-close' onClick={onClose} aria-label='关闭配置'>
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className='skill-config-body'>
          {loading ? (
            <div className='skill-config-empty'>
              <span>{React.createElement(LoadingFour, { size: 16, fill: 'currentColor', theme: 'outline' })}</span>
              <span>加载配置...</span>
            </div>
          ) : fields.length === 0 ? (
            <div className='skill-config-empty'>
              <span>{React.createElement(Inbox, { size: 16, fill: '#9ca3af', theme: 'outline' })}</span>
              <span>该技能暂无可配置项</span>
            </div>
          ) : (
            <div className='skill-config-fields'>
              {fields.map((field) => (
                <div key={field.key} className='skill-config-field'>
                  <label className='skill-config-field-label'>
                    {formatLabel(field.label)}
                  </label>
                  {field.description && (
                    <p className='skill-config-field-desc'>{field.description}</p>
                  )}
                  <ConfigFieldInput
                    field={field}
                    value={config[field.key]}
                    onChange={(val) => updateField(field.key, val)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className='skill-config-footer'>
          {saved && <span className='skill-config-saved'>✓ 已保存</span>}
          <button
            className='skill-config-btn skill-config-btn--cancel'
            onClick={onClose}
          >
            取消
          </button>
          <button
            className='skill-config-btn skill-config-btn--save'
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 配置字段输入控件 */
interface ConfigFieldInputProps {
  field: ConfigFieldDef
  value: unknown
  onChange: (value: unknown) => void
}

function ConfigFieldInput({ field, value, onChange }: ConfigFieldInputProps) {
  switch (field.type) {
    case 'text':
      return (
        <input
          className='skill-config-input'
          type='text'
          value={String(value ?? field.defaultValue ?? '')}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'number':
      return (
        <input
          className='skill-config-input'
          type='number'
          value={String(value ?? field.defaultValue ?? '')}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )

    case 'toggle':
      return (
        <label className='skill-config-toggle'>
          <input
            type='checkbox'
            checked={Boolean(value ?? field.defaultValue ?? false)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className='skill-config-toggle-track'>
            <span className='skill-config-toggle-thumb' />
          </span>
        </label>
      )

    case 'select':
      return (
        <select
          className='skill-config-select'
          value={String(value ?? field.defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options?.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      )

    case 'slider': {
      const numValue = typeof value === 'number' ? value : Number(field.defaultValue ?? 0)
      return (
        <div className='skill-config-slider-group'>
          <input
            className='skill-config-slider'
            type='range'
            value={numValue}
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className='skill-config-slider-value'>{numValue}</span>
        </div>
      )
    }

    default:
      return (
        <input
          className='skill-config-input'
          type='text'
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}
