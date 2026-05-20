/**
 * 模型选择器组件
 * 从 Ollama 获取已安装模型列表，支持下拉选择和手动输入
 * 仅在点击刷新按钮时扫描，不自动加载
 */
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { STATUS_ICONS, ACTION_ICONS } from '../common/IconMap'

interface ModelSelectorProps {
  /** 当前选中的模型名称 */
  readonly value: string
  /** 模型变更回调 */
  readonly onChange: (model: string) => void
  /** 输入框占位文本 */
  readonly placeholder?: string
  /** 是否禁用 */
  readonly disabled?: boolean
  /** 筛选模型的关键词（如 'vision' 用于视觉模型） */
  readonly filterKeyword?: string
}

/** 模型信息 */
interface OllamaModel {
  readonly name: string
  readonly size: number
}

export function ModelSelector({
  value,
  onChange,
  placeholder = '输入模型名称',
  disabled = false,
  filterKeyword,
}: ModelSelectorProps) {
  const [models, setModels] = useState<OllamaModel[]>([])
  const [loading, setLoading] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  /** 从 Ollama 获取模型列表（仅手动触发） */
  const fetchModels = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.invoke('ollama:listModels') as {
        success: boolean
        models: OllamaModel[]
      }
      if (result.success) {
        let list = result.models
        if (filterKeyword) {
          list = list.filter((m) =>
            m.name.toLowerCase().includes(filterKeyword.toLowerCase())
          )
        }
        setModels(list)
        setScanned(true)
        // 扫描无结果时，自动聚焦输入框引导用户手动输入
        if (list.length === 0) {
          setTimeout(() => inputRef.current?.focus(), 100)
        }
      } else {
        setModels([])
        setScanned(true)
        setTimeout(() => inputRef.current?.focus(), 100)
      }
    } catch {
      setModels([])
      setScanned(true)
      setTimeout(() => inputRef.current?.focus(), 100)
    } finally {
      setLoading(false)
    }
  }, [filterKeyword])

  /** 格式化模型大小 */
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return ''
    const gb = bytes / (1024 * 1024 * 1024)
    return gb >= 1 ? `${gb.toFixed(1)}GB` : `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  }

  /** 从下拉选择模型 */
  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value
    if (selected === '__input__') {
      // 选择"手动输入" → 聚焦输入框
      inputRef.current?.focus()
      inputRef.current?.select()
    } else if (selected !== '__placeholder__') {
      onChange(selected)
    }
  }

  // 判断当前值是否匹配下拉列表中的模型
  const matchedModel = models.find((m) => m.name === value)
  const selectValue = matchedModel ? value : (value ? '__input__' : '__placeholder__')

  return (
    <div className="model-selector">
      <select
        className="model-selector-select"
        value={selectValue}
        onChange={handleSelect}
        disabled={disabled}
      >
        {/* 占位提示 */}
        {!scanned && !value && (
          <option value="__placeholder__">点击扫描可用模型</option>
        )}
        {scanned && loading && (
          <option value="__placeholder__">扫描中…</option>
        )}
        {scanned && !loading && models.length === 0 && (
          <option value="__placeholder__">未发现模型，请手动输入</option>
        )}
        {scanned && !loading && models.length > 0 && !matchedModel && (
          <option value="__placeholder__">请选择模型</option>
        )}
        {/* 模型列表 */}
        {models.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name} {formatSize(m.size) ? `(${formatSize(m.size)})` : ''}
          </option>
        ))}
        {/* 手动输入入口 */}
        <option value="__input__">手动输入模型名</option>
      </select>
      <input
        ref={inputRef}
        className={`model-selector-input${inputFocused ? ' model-selector-input--focused' : ''}`}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        placeholder={scanned && models.length === 0 ? '例如：qwen2.5、llama3.2' : placeholder}
        disabled={disabled}
      />
      <button
        className="model-selector-refresh"
        type="button"
        onClick={fetchModels}
        disabled={loading}
        title="扫描模型列表"
      >
        {loading ? STATUS_ICONS.loading : ACTION_ICONS.refresh}
      </button>
    </div>
  )
}
