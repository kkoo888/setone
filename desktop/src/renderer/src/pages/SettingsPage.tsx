/**
 * 增强版设置页面
 * 分区展示：Ollama配置、外观设置、通用设置、性能监控配置
 * 版块25 - 设置面板增强
 */
import React, { useCallback } from 'react'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useAppStore } from '../stores/useAppStore'
import { ModuleHeader } from '../components/common/module/ModuleHeader'
import { SettingsSection } from '../components/settings/SettingsSection'
import { OllamaConfig } from '../components/settings/OllamaConfig'

import { LanguageSelector } from '../components/settings/LanguageSelector'
import { PerformanceMonitorConfig } from '../components/settings/PerformanceMonitorConfig'
import { AvatarUploader } from '../components/settings/AvatarUploader'
import { ModelSelector } from '../components/settings/ModelSelector'
import { Toggle } from '../components/common/Toggle'
import { Slider } from '../components/common/Slider'
import { Button } from '../components/common/Button'

import type { OllamaConfig as OllamaConfigType, PerformanceMonitorSettings, Language } from '../types/settings'

export function SettingsPage() {
  const {
    settings,
    setAISettings,
    setOllamaConfig,
    setAppearance,
    setGeneralSettings,
    setPerformanceMonitorSettings,
    setAssistantName,
    resetToDefaults,
    saveToMainProcess,
  } = useSettingsStore()

  const { setLanguage } = useAppStore()

  /** 处理 Ollama 配置变更 */
  const handleOllamaChange = useCallback(
    (updates: Partial<OllamaConfigType>) => {
      setOllamaConfig(updates)
    },
    [setOllamaConfig]
  )

  /** 处理语言变更（同时更新 appStore 和 settingsStore） */
  const handleLanguageChange = useCallback(
    (language: Language) => {
      setLanguage(language)
      setAppearance({ language })
    },
    [setLanguage, setAppearance]
  )

  /** 处理性能监控设置变更 */
  const handlePerfChange = useCallback(
    (updates: Partial<PerformanceMonitorSettings>) => {
      setPerformanceMonitorSettings(updates)
    },
    [setPerformanceMonitorSettings]
  )

  /** 恢复默认设置 */
  const handleReset = useCallback(() => {
    if (window.confirm('确定要恢复所有设置到默认值吗？此操作不可撤销。')) {
      resetToDefaults()
    }
  }, [resetToDefaults])

  /** 保存设置到主进程 */
  const handleSave = useCallback(() => {
    saveToMainProcess()
  }, [saveToMainProcess])

  return (
    <div className="settings-page mod-page">
      <ModuleHeader icon={settingI} title="设置" />

      {/* Ollama 配置 */}
      <SettingsSection
        title="Ollama 配置"
        description="配置本地 Ollama 服务连接参数"
        icon={robotI}
      >
        <OllamaConfig config={settings.ollama} onChange={handleOllamaChange} />
      </SettingsSection>

      {/* AI 设置 */}
      <SettingsSection
        title="AI 设置"
        description="配置 AI 模型和对话参数"
        icon={brainI}
      >
        <div className="settings-row">
          <label className="settings-label">模型</label>
          <ModelSelector
            value={settings.ollama.model}
            onChange={(model) => {
              setAISettings({ model })
              setOllamaConfig({ model })
            }}
            placeholder="gpt-4o-mini"
          />
        </div>
        <div className="settings-row">
          <label className="settings-label">API Base URL</label>
          <input
            className="settings-input"
            value={settings.ai.baseUrl}
            onChange={(e) => setAISettings({ baseUrl: e.target.value })}
          />
        </div>
        <Slider
          label="Temperature"
          value={settings.ai.temperature}
          onChange={(v) => setAISettings({ temperature: v })}
          min={0}
          max={2}
          step={0.1}
        />
        <Slider
          label="Max Tokens"
          value={settings.ai.maxTokens}
          onChange={(v) => setAISettings({ maxTokens: v })}
          min={256}
          max={32768}
          step={256}
        />
      </SettingsSection>

      {/* 外观设置 */}
      <SettingsSection
        title="外观设置"
        description="自定义界面主题、头像和语言"
        icon="🎨"
      >
        <AvatarUploader />
        <div className="settings-row">
          <label className="settings-label">语言</label>
          <LanguageSelector language={settings.appearance.language} onChange={handleLanguageChange} />
        </div>
        <Slider
          label="字体大小"
          value={settings.appearance.fontSize}
          onChange={(v) => setAppearance({ fontSize: v })}
          min={12}
          max={24}
          step={1}
          formatValue={(v) => `${v}px`}
        />
      </SettingsSection>

      {/* 通用设置 */}
      <SettingsSection
        title="通用设置"
        description="应用行为和通知配置"
        icon={settingI}
      >
        <div className="settings-row">
          <label className="settings-label">助手名称</label>
          <input
            className="settings-input"
            value={settings.assistantName}
            onChange={(e) => setAssistantName(e.target.value)}
            placeholder="小茜"
          />
        </div>
        <Toggle
          label="开机自启"
          checked={settings.general.autostart}
          onChange={(checked) => setGeneralSettings({ autostart: checked })}
        />
        <Toggle
          label="最小化到托盘"
          checked={settings.general.minimizeToTray}
          onChange={(checked) => setGeneralSettings({ minimizeToTray: checked })}
        />
        <Toggle
          label="显示通知"
          checked={settings.general.showNotifications}
          onChange={(checked) => setGeneralSettings({ showNotifications: checked })}
        />
        <div className="settings-row">
          <label className="settings-label">日志级别</label>
          <select
            className="settings-select"
            value={settings.general.logLevel}
            onChange={(e) => setGeneralSettings({ logLevel: e.target.value as 'debug' | 'info' | 'warn' | 'error' })}
          >
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
      </SettingsSection>

      {/* 性能监控配置 */}
      <SettingsSection
        title="性能监控"
        description="配置系统资源监控参数"
        icon={chartI}
      >
        <PerformanceMonitorConfig
          config={settings.performanceMonitor}
          onChange={handlePerfChange}
        />
      </SettingsSection>

      {/* 底部操作栏 */}
      <div className="settings-footer">
        <Button variant="ghost" onClick={handleReset}>恢复默认</Button>
        <Button variant="primary" onClick={handleSave}>保存设置</Button>
      </div>
    </div>
  )
}
