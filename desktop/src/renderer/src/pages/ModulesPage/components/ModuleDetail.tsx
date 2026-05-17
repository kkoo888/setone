/**
 * 模块详情侧滑面板
 * 展示选中模块的完整信息：描述、状态、能力、权限、依赖、错误信息
 */
import React, { useMemo } from 'react'
import type { ModuleInfo, ModuleStatus } from '../../../stores/useModulesStore'

interface ModuleDetailProps {
  /** 模块信息 */
  readonly module: ModuleInfo
  /** 关闭详情回调 */
  readonly onClose: () => void
  /** 启停切换回调 */
  readonly onToggle: (id: string) => void
}

/** 权限图标映射 */
const PERMISSION_ICONS: Record<string, string> = {
  'file.read': '📖',
  'file.write': '✏️',
  'network': '🌐',
  'system': '⚙️',
  'clipboard': '📋',
  'notification': '🔔',
  'shell': '💻',
  'database': '🗄️',
}

/** 权限描述映射 */
const PERMISSION_DESC: Record<string, string> = {
  'file.read': '读取文件',
  'file.write': '写入文件',
  'network': '网络访问',
  'system': '系统调用',
  'clipboard': '剪贴板访问',
  'notification': '发送通知',
  'shell': 'Shell 命令执行',
  'database': '数据库操作',
}

/** 状态配置 */
const STATUS_CONFIG: Record<ModuleStatus, { label: string; className: string }> = {
  active: { label: '运行中', className: 'mod-status-badge--active' },
  disabled: { label: '已停止', className: 'mod-status-badge--disabled' },
  loading: { label: '加载中', className: 'mod-status-badge--loading' },
  error: { label: '异常', className: 'mod-status-badge--error' },
  discovered: { label: '已发现', className: 'mod-status-badge--discovered' },
}

export function ModuleDetail({ module, onClose, onToggle }: ModuleDetailProps) {
  const status = module.status ?? (module.enabled ? 'active' : 'disabled')
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.disabled

  /** 权限列表 */
  const permissions = useMemo(() => module.permissions ?? [], [module.permissions])

  /** 能力列表 */
  const capabilities = useMemo(() => module.capabilities ?? [], [module.capabilities])

  /** 依赖列表 */
  const dependencies = useMemo(() => module.dependencies ?? [], [module.dependencies])

  return (
    <div className='mod-detail-overlay' onClick={onClose}>
      <div
        className='mod-detail-panel'
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className='mod-detail-header'>
          <div className='mod-detail-header-left'>
            <div className='mod-detail-icon'>
              <span>{module.icon ?? '📦'}</span>
            </div>
            <div className='mod-detail-title-group'>
              <h2 className='mod-detail-name'>{module.name}</h2>
              <div className='mod-detail-meta-line'>
                <span>v{module.version}</span>
                {module.author && <span>· {module.author}</span>}
                <span>· {module.id}</span>
              </div>
            </div>
          </div>
          <button
            type='button'
            className='mod-detail-close'
            onClick={onClose}
            aria-label='关闭详情'
          >
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className='mod-detail-body'>
          {/* 状态 */}
          <div className='mod-detail-section'>
            <h3 className='mod-detail-section-title'>状态</h3>
            <span className={`mod-status-badge ${statusConfig.className}`}>
              <span className={`mod-status-dot${status === 'loading' ? ' mod-status-dot--loading' : ''}`} />
              {statusConfig.label}
            </span>
          </div>

          {/* 描述 */}
          <div className='mod-detail-section'>
            <h3 className='mod-detail-section-title'>描述</h3>
            <p className='mod-detail-section-content'>
              {module.description ?? '暂无描述'}
            </p>
          </div>

          {/* 错误信息 */}
          {status === 'error' && module.error && (
            <div className='mod-detail-section'>
              <h3 className='mod-detail-section-title'>错误信息</h3>
              <div className='mod-detail-error'>
                <span className='mod-detail-error-icon'>⚠️</span>
                <span>{module.error}</span>
              </div>
            </div>
          )}

          {/* 能力列表 */}
          {capabilities.length > 0 && (
            <div className='mod-detail-section'>
              <h3 className='mod-detail-section-title'>能力</h3>
              <div className='mod-detail-capabilities'>
                {capabilities.map((cap) => (
                  <span key={cap} className='mod-detail-cap-tag'>
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 权限列表 */}
          {permissions.length > 0 && (
            <div className='mod-detail-section'>
              <h3 className='mod-detail-section-title'>权限</h3>
              <div className='mod-detail-permissions'>
                {permissions.map((perm) => (
                  <div key={perm} className='mod-detail-permission'>
                    <span className='mod-detail-permission-icon'>
                      {PERMISSION_ICONS[perm] ?? '🔑'}
                    </span>
                    <span className='mod-detail-permission-name'>{perm}</span>
                    <span className='mod-detail-permission-desc'>
                      {PERMISSION_DESC[perm] ?? ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 依赖列表 */}
          {dependencies.length > 0 && (
            <div className='mod-detail-section'>
              <h3 className='mod-detail-section-title'>依赖</h3>
              <div className='mod-detail-deps'>
                {dependencies.map((dep) => (
                  <div key={dep} className='mod-detail-dep'>
                    <span className='mod-detail-dep-icon'>📦</span>
                    <span>{dep}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className='mod-detail-footer'>
          <span className='mod-detail-toggle-label'>
            {module.enabled ? '模块正在运行' : '模块已停止'}
          </span>
          <button
            type='button'
            className={`mod-detail-toggle-btn ${
              module.enabled ? 'mod-detail-toggle-btn--disable' : 'mod-detail-toggle-btn--enable'
            }`}
            onClick={() => onToggle(module.id)}
          >
            {module.enabled ? '停止模块' : '启动模块'}
          </button>
        </div>
      </div>
    </div>
  )
}
