/**
 * Ollama 连接配置组件
 * 支持配置 Ollama 服务地址、模型选择、测试连接
 */
import React, { useState, useCallback } from 'react'
import type { OllamaConfig as OllamaConfigType } from '../../types/settings'
import { Button } from '../common/Button'
import { Toggle } from '../common/Toggle'
import { Slider } from '../common/Slider'
import { ModelSelector } from './ModelSelector'

interface OllamaConfigProps {
  /** 当前 Ollama 配置 */
  readonly config: OllamaConfigType
  /** 配置变更回调 */
  readonly onChange: (updates: Partial<OllamaConfigType>) => void
}

/** 连接测试状态 */
type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error'

export function OllamaConfig({ config, onChange }: OllamaConfigProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [connectionMessage, setConnectionMessage] = useState('')

  /** 测试 Ollama 连接 */
  const testConnection = useCallback(async () => {
    setConnectionStatus('testing')
    setConnectionMessage('正在测试连接...')
    try {
      const result = await window.electronAPI.invoke('ollama:listModels') as { success: boolean; models: unknown[] }
      if (result.success) {
        const count = result.models.length
        setConnectionStatus('success')
        setConnectionMessage(`连接成功！发现 ${count} 个模型。`)
      } else {
        setConnectionStatus('error')
        setConnectionMessage('连接失败：无法访问 Ollama 服务。')
      }
    } catch {
      setConnectionStatus('error')
      setConnectionMessage('连接失败：请检查 Ollama 服务是否启动。')
    }
  }, [])

  return (
    <div className="ollama-config">
      {/* 服务地址 */}
      <div className="settings-row">
        <label className="settings-label">服务地址</label>
        <input
          type="text"
          className="settings-input"
          value={config.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          placeholder="http://localhost:11434"
        />
      </div>

      {/* 默认模型 */}
      <div className="settings-row">
        <label className="settings-label">默认模型</label>
        <ModelSelector
          value={config.model}
          onChange={(model) => onChange({ model })}
          placeholder="llama3.2"
        />
      </div>

      {/* 视觉模型 */}
      <div className="settings-row">
        <label className="settings-label">视觉模型</label>
        <ModelSelector
          value={config.visionModel}
          onChange={(visionModel) => onChange({ visionModel })}
          placeholder="llava"
          filterKeyword="vl"
        />
      </div>

      {/* 嵌入模型 */}
      <div className="settings-row">
        <label className="settings-label">嵌入模型</label>
        <ModelSelector
          value={config.embeddingModel}
          onChange={(embeddingModel) => onChange({ embeddingModel })}
          placeholder="nomic-embed-text"
          filterKeyword="embed"
        />
      </div>

      {/* 超时时间 */}
      <Slider
        label="请求超时（秒）"
        value={config.timeout / 1000}
        onChange={(v) => onChange({ timeout: v * 1000 })}
        min={5}
        max={120}
        step={5}
        formatValue={(v) => `${v}s`}
      />

      {/* 自动启动 */}
      <Toggle
        label="自动启动 Ollama"
        checked={config.autoStart}
        onChange={(checked) => onChange({ autoStart: checked })}
      />

      {/* 测试连接 */}
      <div className="settings-row">
        <Button
          variant="secondary"
          onClick={testConnection}
          loading={connectionStatus === 'testing'}
        >
          测试连接
        </Button>
        {connectionMessage && (
          <span
            className={`connection-status connection-${connectionStatus}`}
          >
            {connectionMessage}
          </span>
        )}
      </div>
    </div>
  )
}
