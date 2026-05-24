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

/** 知识库模块：显示路径配置 */
function KnowledgeBaseSettings() {
  const [paths, setPaths] = useState<KBPaths | null>(null)

  useEffect(() => {
    // 通过 kb_network_status 获取当前路径配置
    window.api?.invoke?.('kb_network_status', {}).then((res: any) => {
      if (res?.success && res?.data) {
        setPaths({ rawDir: res.data.rawDir, indexDir: res.data.indexDir })
      }
    }).catch(() => {})
  }, [])

  if (!paths) return null

  return (
    <div className="module-detail-section">
      <h4>📁 存储路径</h4>
      <div className="module-detail-paths">
        <div className="path-item">
          <span className="path-label">原始文件：</span>
          <span className="path-value" title={paths.rawDir}>{paths.rawDir}</span>
        </div>
        <div className="path-item">
          <span className="path-label">索引目录：</span>
          <span className="path-value" title={paths.indexDir}>{paths.indexDir}</span>
        </div>
      </div>
      <p className="path-hint">在模块设置中修改 rawDir / indexDir 配置项</p>
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
