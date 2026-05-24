/**
 * 模块详情面板组件
 * 展示选中模块的详细信息和资源使用
 */
import React, { useEffect, useState } from 'react'
import type { ModuleInfo } from '../../stores/useModulesStore'
import { FolderOpen } from '../../utils/statusMessages'
import { Button } from '../common/Button'

/** 知识库路径配置 */
interface KBPaths {
  rawDir: string
  indexDir: string
}

interface ModuleDetailProps {
  /** 模块信息 */
  readonly module: ModuleInfo
  /** 关闭详情回调 */
  readonly onClose: () => void
  /** 启停切换回调 */
  readonly onToggle: (id: string) => void
}

/** 知识库模块：显示和编辑路径配置 */
function KnowledgeBaseSettings() {
  const [paths, setPaths] = useState<KBPaths | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<KBPaths>({ rawDir: '', indexDir: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api?.invoke?.('kb_network_status', {}).then((res: any) => {
      if (res?.success && res?.data) {
        const p = { rawDir: res.data.rawDir, indexDir: res.data.indexDir }
        setPaths(p)
        setDraft(p)
      }
    }).catch(() => {})
  }, [])

  const pickFolder = async (field: 'rawDir' | 'indexDir') => {
    const res = await window.api?.invoke?.('dialog:openFile', { properties: ['openDirectory'] })
    if (!res?.canceled && res?.filePaths?.[0]) {
      setDraft(prev => ({ ...prev, [field]: res.filePaths[0] }))
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await window.api?.invoke?.('module:saveSettings', {
        moduleId: 'knowledge-base',
        settings: { rawDir: draft.rawDir, indexDir: draft.indexDir }
      })
      setPaths(draft)
      setEditing(false)
    } catch (err) {
      console.error('保存知识库设置失败:', err)
    } finally {
      setSaving(false)
    }
  }

  if (!paths) return null

  return (
    <div className="module-detail-section">
      <h4>📁 存储路径</h4>
      {editing ? (
        <div className="module-detail-paths-edit">
          <div className="path-edit-row">
            <span className="path-label">原始文件：</span>
            <input
              type="text"
              className="path-input"
              value={draft.rawDir}
              onChange={e => setDraft(prev => ({ ...prev, rawDir: e.target.value }))}
              placeholder="留空使用默认目录"
            />
            <button type="button" className="path-pick-btn" onClick={() => pickFolder('rawDir')}>📂</button>
          </div>
          <div className="path-edit-row">
            <span className="path-label">索引目录：</span>
            <input
              type="text"
              className="path-input"
              value={draft.indexDir}
              onChange={e => setDraft(prev => ({ ...prev, indexDir: e.target.value }))}
              placeholder="留空使用默认目录"
            />
            <button type="button" className="path-pick-btn" onClick={() => pickFolder('indexDir')}>📂</button>
          </div>
          <div className="path-edit-actions">
            <button type="button" className="path-save-btn" onClick={save} disabled={saving}>
              {saving ? '保存中...' : '保存并重载'}
            </button>
            <button type="button" className="path-cancel-btn" onClick={() => { setDraft(paths); setEditing(false) }}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="module-detail-paths">
            <div className="path-item">
              <span className="path-label">原始文件：</span>
              <span className="path-value" title={paths.rawDir}>{paths.rawDir || '(默认)'}</span>
            </div>
            <div className="path-item">
              <span className="path-label">索引目录：</span>
              <span className="path-value" title={paths.indexDir}>{paths.indexDir || '(默认)'}</span>
            </div>
          </div>
          <button type="button" className="path-edit-btn" onClick={() => setEditing(true)}>✏️ 修改路径</button>
        </>
      )}
    </div>
  )
}

export function ModuleDetail({ module, onClose, onToggle }: ModuleDetailProps) {
  return (
    <div className="module-detail">
      <div className="module-detail-header">
        <div className="module-detail-title">
          <span className="module-detail-icon">{module.icon ?? React.createElement(FolderOpen, { size: 16, fill: 'currentColor', theme: 'outline' })}</span>
          <div>
            <h3>{module.name}</h3>
            <span className="module-detail-version">v{module.version}</span>
          </div>
        </div>
        <button type="button" className="module-detail-close" onClick={onClose}>✕</button>
      </div>

      <div className="module-detail-body">
        <div className="module-detail-section">
          <h4>描述</h4>
          <p>{module.description}</p>
        </div>

        <div className="module-detail-section">
          <h4>状态</h4>
          <div className="module-detail-status">
            <span className={`status-badge ${module.enabled ? 'status-enabled' : 'status-disabled'}`}>
              {module.enabled ? '运行中' : '已停止'}
            </span>
          </div>
        </div>

        {module.id === 'knowledge-base' && module.enabled && <KnowledgeBaseSettings />}

        <div className="module-detail-actions">
          <Button
            variant={module.enabled ? 'danger' : 'primary'}
            onClick={() => onToggle(module.id)}
          >
            {module.enabled ? '停止模块' : '启动模块'}
          </Button>
        </div>
      </div>
    </div>
  )
}
