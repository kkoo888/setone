/**
 * 模块管理页面
 * 展示所有已安装模块，支持搜索、状态筛选、启停、详情查看
 * 参考 SkillsPage 结构，采用列表式卡片布局
 */
import React, { useEffect, useMemo, useCallback, useState } from 'react'
import { useModulesStore, type ModuleStatus } from '../stores/useModulesStore'
import { ModuleHeader } from '../components/common/module/ModuleHeader'
import { ModuleCard } from './ModulesPage/components/ModuleCard'
import { ModuleDetail } from './ModulesPage/components/ModuleDetail'

import '../styles/modules.css'

/** 状态筛选选项 */
const STATUS_FILTERS: { key: string; label: string; value: ModuleStatus | 'all' }[] = [
  { key: 'all', label: '全部', value: 'all' },
  { key: 'active', label: '运行中', value: 'active' },
  { key: 'disabled', label: '已停止', value: 'disabled' },
  { key: 'error', label: '异常', value: 'error' },
]

export function ModulesPage() {
  const {
    modules,
    selectedModuleId,
    loading,
    setModules,
    toggleModule,
    selectModule,
  } = useModulesStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ModuleStatus | 'all'>('all')

  /** 加载模块列表 */
  useEffect(() => {
    window.electronAPI
      .invoke('module:list')
      .then((list) => {
        if (Array.isArray(list)) {
          // 为每个模块补充默认 status 字段
          const enriched = list.map((m: Record<string, unknown>) => ({
            ...m,
            status: m.status ?? (m.enabled ? 'active' : 'disabled'),
          }))
          setModules(enriched)
        }
      })
      .catch(console.error)
  }, [setModules])

  /** 处理模块启停 */
  const handleToggle = useCallback(
    (id: string) => {
      toggleModule(id)
    },
    [toggleModule]
  )

  /** 点击卡片打开详情 */
  const handleCardClick = useCallback(
    (id: string) => {
      selectModule(id)
    },
    [selectModule]
  )

  /** 关闭详情面板 */
  const handleCloseDetail = useCallback(() => {
    selectModule(null)
  }, [selectModule])

  /** 过滤后的模块列表 */
  const filteredModules = useMemo(() => {
    let result = modules

    // 按状态筛选
    if (statusFilter !== 'all') {
      result = result.filter((m) => (m.status ?? (m.enabled ? 'active' : 'disabled')) === statusFilter)
    }

    // 按搜索关键词筛选
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description?.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q)
      )
    }

    return result
  }, [modules, statusFilter, searchQuery])

  /** 选中的模块详情 */
  const selectedModule = useMemo(
    () => modules.find((m) => m.id === selectedModuleId) ?? null,
    [modules, selectedModuleId]
  )

  /** 统计启用数量 */
  const enabledCount = modules.filter((m) => m.enabled).length

  return (
    <div className='modules-page mod-page'>
      {/* 顶部标题区 */}
      <ModuleHeader
        icon="🧩"
        title="模块管理"
        actions={
          <div className='module-search'>
            <span className='module-search-icon'>{searchI}</span>
            <input
              className='module-search-input'
              type='text'
              placeholder='搜索模块...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        }
      />

      {/* 状态筛选标签 */}
      <div className='modules-filter-tags'>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`modules-filter-tag${statusFilter === f.value ? ' active' : ''}`}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 模块列表 */}
      <div className='modules-list'>
        {loading ? (
          <div className='modules-empty'>
            <span className='modules-empty-icon'>{loadingI}</span>
            <span className='modules-empty-text'>加载中...</span>
          </div>
        ) : filteredModules.length === 0 ? (
          <div className='modules-empty'>
            <span className='modules-empty-icon'>{inboxI}</span>
            <span className='modules-empty-text'>
              {searchQuery ? '没有匹配的模块' : '暂无已安装模块'}
            </span>
          </div>
        ) : (
          filteredModules.map((m) => (
            <ModuleCard
              key={m.id}
              module={m}
              selected={selectedModuleId === m.id}
              onSelect={handleCardClick}
              onToggle={handleToggle}
            />
          ))
        )}
      </div>

      {/* 详情侧滑面板 */}
      {selectedModule && (
        <ModuleDetail
          module={selectedModule}
          onClose={handleCloseDetail}
          onToggle={handleToggle}
        />
      )}
    </div>
  )
}
