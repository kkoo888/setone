/**
 * 模块详情面板组件
 * 展示选中模块的详细信息和资源使用
 */
import React from 'react'
import type { ModuleInfo } from '../../stores/useModulesStore'
import { FolderOpen } from '../../utils/statusMessages'
import { Button } from '../common/Button'

interface ModuleDetailProps {
  /** 模块信息 */
  readonly module: ModuleInfo
  /** 关闭详情回调 */
  readonly onClose: () => void
  /** 启停切换回调 */
  readonly onToggle: (id: string) => void
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
