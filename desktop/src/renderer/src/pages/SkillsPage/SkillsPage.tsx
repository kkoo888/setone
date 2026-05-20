/**
 * 技能管理页面
 * 展示技能列表，支持搜索、分类、激活/停用、详情查看、回收站、配置
 */
import React, { useEffect, useMemo, useCallback, useState } from 'react'
import { useSkillStore } from '../../stores/useSkillStore'
import { useSkillFilter } from './hooks/useSkillFilter'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { SkillSearch } from './components/SkillSearch'
import { SkillTags } from './components/SkillTags'
import { SkillCard } from './components/SkillCard'
import { SkillDetail } from './components/SkillDetail'
import { SkillTrashDialog } from './components/SkillTrashDialog'
import { SkillConfigPanel } from './components/SkillConfigPanel'
import { SkillInstallDialog } from './components/SkillInstallDialog'
import { SkillUpdateDialog } from './components/SkillUpdateDialog'
import { NetworkToggle } from './components/NetworkToggle'
import SkillCreateDialog from './components/SkillCreateDialog'
import { Magic, Search, DeleteOne, Refresh, Fire, LoadingFour, Inbox } from '../../utils/statusMessages'
import SkillRefinePanel from './components/SkillRefinePanel'

const magicI = React.createElement(Magic, { size: 16, fill: 'currentColor', theme: 'outline' })
const searchI = React.createElement(Search, { size: 16, fill: 'currentColor', theme: 'outline' })
const delI = React.createElement(DeleteOne, { size: 16, fill: 'currentColor', theme: 'outline' })
const refreshI = React.createElement(Refresh, { size: 16, fill: 'currentColor', theme: 'outline' })
const fireI = React.createElement(Fire, { size: 16, fill: 'currentColor', theme: 'outline' })
const loadingI = React.createElement(LoadingFour, { size: 32, fill: '#9ca3af', theme: 'outline' })
const inboxI = React.createElement(Inbox, { size: 32, fill: '#9ca3af', theme: 'outline' })

/** 二级导航标签 */
const NAV_TABS = ['推荐', 'SkillHub', '套件']

export function SkillsPage() {
  const {
    skills,
    activeTag,
    searchQuery,
    selectedSkillId,
    activeTab,
    loading,
    setActiveTag,
    setSearchQuery,
    selectSkill,
    setActiveTab,
    toggleSkill,
    loadSkills,
    scanSkills,
    setInstallDialogOpen,
    setUpdateDialogOpen
  } = useSkillStore()

  const installDialogOpen = useSkillStore((s) => s.installDialogOpen)
  const updateDialogOpen = useSkillStore((s) => s.updateDialogOpen)
  const createDialogOpen = useSkillStore((s) => s.createDialogOpen)
  const refinePanelOpen = useSkillStore((s) => s.refinePanelOpen)
  const refineTarget = useSkillStore((s) => s.refineTarget)
  const setCreateDialogOpen = useSkillStore((s) => s.setCreateDialogOpen)
  const setRefinePanelOpen = useSkillStore((s) => s.setRefinePanelOpen)

  /** 回收站弹窗状态 */
  const [showTrash, setShowTrash] = useState(false)
  /** 配置面板状态 */
  const [configSkillId, setConfigSkillId] = useState<string | null>(null)

  /** 加载技能列表 */
  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  /** 过滤后的技能列表 */
  const filteredSkills = useSkillFilter(skills, activeTag, searchQuery)

  /** 提取所有标签 */
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    skills.forEach((s) => s.tags.forEach((t) => tagSet.add(t)))
    return ['全部', ...Array.from(tagSet)]
  }, [skills])

  /** 选中的技能详情 */
  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId) ?? null,
    [skills, selectedSkillId]
  )

  /** 配置中的技能 */
  const configSkill = useMemo(
    () => skills.find((s) => s.id === configSkillId) ?? null,
    [skills, configSkillId]
  )

  /** 炼化目标技能 */
  const refineTargetSkill = useMemo(
    () => skills.find((s) => s.id === refineTarget) ?? null,
    [skills, refineTarget]
  )

  /** 切换技能详情 */
  const handleCardClick = useCallback(
    (id: string) => {
      selectSkill(id)
    },
    [selectSkill]
  )

  /** 关闭详情面板 */
  const handleCloseDetail = useCallback(() => {
    selectSkill(null)
  }, [selectSkill])

  /** 打开回收站 */
  const handleOpenTrash = useCallback(() => {
    setShowTrash(true)
  }, [])

  /** 关闭回收站 */
  const handleCloseTrash = useCallback(() => {
    setShowTrash(false)
  }, [])

  /** 打开配置面板 */
  const handleOpenConfig = useCallback((id: string) => {
    setConfigSkillId(id)
  }, [])

  /** 关闭配置面板 */
  const handleCloseConfig = useCallback(() => {
    setConfigSkillId(null)
  }, [])

  /** 扫描本地技能 */
  const handleScanSkills = useCallback(() => {
    scanSkills()
  }, [scanSkills])

  /** 打开炼化面板 */
  const handleOpenRefine = useCallback((id: string) => {
    setRefinePanelOpen(true, id)
  }, [setRefinePanelOpen])

  /** 关闭炼化面板 */
  const handleCloseRefine = useCallback(() => {
    setRefinePanelOpen(false)
  }, [setRefinePanelOpen])

  /** 激活数量统计 */
  const activeCount = skills.filter((s) => s.active).length

  return (
    <div className='skills-page mod-page'>
      {/* 顶部标题区 */}
      <ModuleHeader
        icon={magicI}
        title="技能"
        actions={
          <>
            <NetworkToggle />
            <SkillSearch value={searchQuery} onChange={setSearchQuery} />
            <button className='btn-skill-action' onClick={handleScanSkills} title='扫描本地技能' aria-label='扫描本地技能'>
              <span>{searchI}</span> 扫描
            </button>
            <button className='btn-skill-action' onClick={handleOpenTrash} title='回收站' aria-label='打开回收站'>
              <span>{delI}</span> 回收站
            </button>
            <button className='btn-skill-action' onClick={() => setUpdateDialogOpen(true)} title='检查更新' aria-label='检查技能更新'>
              <span>{refreshI}</span> 更新
            </button>
            <button className='btn-skill-primary' onClick={() => setInstallDialogOpen(true)}>
              <span>+</span> 添加技能
            </button>
            <button className='btn-skill-primary' onClick={() => setCreateDialogOpen(true)}>
              <span>{magicI}</span> 生成技能
            </button>
            <button
              className='btn-skill-action'
              onClick={() => {
                if (selectedSkillId) {
                  handleOpenRefine(selectedSkillId)
                } else if (skills.length > 0) {
                  handleOpenRefine(skills[0].id)
                }
              }}
              title='炼化优化'
              aria-label='炼化优化技能'
            >
              <span>{fireI}</span> 炼化
            </button>
          </>
        }
      />

      {/* 二级导航 */}
      <div className='skills-nav' role='tablist' aria-label='技能导航'>
        {NAV_TABS.map((tab) => (
          <button
            key={tab}
            className={`skills-nav-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
            role='tab'
            aria-selected={activeTab === tab}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 分类标签栏 */}
      <SkillTags tags={allTags} active={activeTag} onChange={setActiveTag} />

      {/* 技能网格 */}
      <div className='skills-grid'>
        {loading ? (
          <div className='skills-empty' style={{ gridColumn: '1 / -1' }}>
            <span className='skills-empty-icon'>{loadingI}</span>
            <span className='skills-empty-text'>加载中...</span>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className='skills-empty' style={{ gridColumn: '1 / -1' }}>
            <span className='skills-empty-icon'>{inboxI}</span>
            <span className='skills-empty-text'>
              {searchQuery ? '没有匹配的技能' : '暂无技能'}
            </span>
          </div>
        ) : (
          filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggle={toggleSkill}
              onClick={handleCardClick}
              onConfig={handleOpenConfig}
            />
          ))
        )}
      </div>

      {/* 详情侧滑面板 */}
      {selectedSkill && (
        <SkillDetail
          skill={selectedSkill}
          onClose={handleCloseDetail}
          onToggle={toggleSkill}
          onConfig={handleOpenConfig}
        />
      )}

      {/* 回收站弹窗 */}
      {showTrash && (
        <SkillTrashDialog onClose={handleCloseTrash} />
      )}

      {/* 配置面板 */}
      {configSkill && (
        <SkillConfigPanel
          skill={configSkill}
          onClose={handleCloseConfig}
        />
      )}

      {/* 安装弹窗 */}
      {installDialogOpen && (
        <SkillInstallDialog onClose={() => setInstallDialogOpen(false)} />
      )}

      {/* 更新弹窗 */}
      {updateDialogOpen && (
        <SkillUpdateDialog />
      )}

      {/* 生成新技能弹窗 */}
      {createDialogOpen && (
        <SkillCreateDialog onClose={() => setCreateDialogOpen(false)} />
      )}

      {/* 炼化优化面板 */}
      {refinePanelOpen && refineTargetSkill && (
        <SkillRefinePanel
          skill={refineTargetSkill}
          onClose={handleCloseRefine}
        />
      )}
    </div>
  )
}
