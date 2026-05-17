/**
 * 模型选择器组件
 * 从 Ollama 获取已安装模型列表，支持下拉选择和手动输入
 * 仅在点击刷新按钮时扫描，不自动加载
 */
import React, { useState, useCallback } from 'react'

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
  placeholder = '选择或输入模型名称',
  disabled = false,
  filterKeyword,
}: ModelSelectorProps) {
  const [models, setModels] = useState<OllamaModel[]>([])
  const [loading, setLoading] = useState(false)
  const [scanned, setScanned] = useState(false)

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
      } else {
        setModels([])
        setScanned(true)
      }
    } catch {
      setModels([])
      setScanned(true)
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

  return (
    <div className="model-selector">
      <select
        className="model-selector-select"
        value={models.some((m) => m.name === value) ? value : '__custom__'}
        onChange={(e) => {
          if (e.target.value !== '__custom__') {
            onChange(e.target.value)
          }
        }}
        disabled={disabled}
      >
        {!scanned && <option value="__custom__">点击 🔄 扫描模型</option>}
        {scanned && loading && <option value="__custom__">扫描中…</option>}
        {scanned && !loading && models.length === 0 && (
          <option value="__custom__">未发现模型</option>
        )}
        {models.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name} {formatSize(m.size) ? `(${formatSize(m.size)})` : ''}
          </option>
        ))}
        <option value="__custom__">✏️ 手动输入…</option>
      </select>
      <input
        className="model-selector-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        className="model-selector-refresh"
        type="button"
        onClick={fetchModels}
        disabled={loading}
        title="扫描模型列表"
      >
        {loading ? '⏳' : '🔄'}
      </button>
    </div>
  )
}
