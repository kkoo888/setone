import React, { useEffect, useCallback, useRef, useState } from 'react'
import { Refresh, Magic, FolderOpen } from '@icon-park/react'
import { useChangesStore, type ChangedFile } from '../../stores/useChangesStore'
import { FileTree } from './FileTree'
import { FilePreview } from './FilePreview'
import '../../styles/changes.css'

/** git 状态码映射 */
const STATUS_LABELS: Record<ChangedFile['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: '?'
}

/**
 * 变更面板主组件
 * 包含变更列表、文件树、文件预览三个标签页
 */
export function ChangesPanel() {
  const isOpen = useChangesStore((s) => s.isOpen)
  const activeTab = useChangesStore((s) => s.activeTab)
  const changedFiles = useChangesStore((s) => s.changedFiles)
  const fileTree = useChangesStore((s) => s.fileTree)
  const previewFile = useChangesStore((s) => s.previewFile)
  const loading = useChangesStore((s) => s.loading)
  const close = useChangesStore((s) => s.close)
  const setActiveTab = useChangesStore((s) => s.setActiveTab)
  const setChangedFiles = useChangesStore((s) => s.setChangedFiles)
  const setFileTree = useChangesStore((s) => s.setFileTree)
  const setPreviewFile = useChangesStore((s) => s.setPreviewFile)
  const setLoading = useChangesStore((s) => s.setLoading)

  // 用于入场动画
  const [animState, setAnimState] = useState<'entering' | 'visible'>('entering')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 触发入场动画
    const timer = requestAnimationFrame(() => {
      setAnimState('visible')
    })
    return () => cancelAnimationFrame(timer)
  }, [])

  /** 加载 git 变更列表 */
  const loadChanges = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.invoke('git:status') as ChangedFile[]
      setChangedFiles(result)
    } catch (err) {
      console.error('加载 git 变更失败:', err)
      setChangedFiles([])
    } finally {
      setLoading(false)
    }
  }, [setChangedFiles, setLoading])

  /** 加载文件树 */
  const loadFileTree = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.invoke('files:list') as import('../../stores/useChangesStore').FileNode[]
      setFileTree(result)
    } catch (err) {
      console.error('加载文件树失败:', err)
      setFileTree([])
    } finally {
      setLoading(false)
    }
  }, [setFileTree, setLoading])

  /** 预览文件 */
  const handlePreview = useCallback(async (filePath: string) => {
    setLoading(true)
    try {
      const result = await window.electronAPI.invoke('files:read', { path: filePath }) as {
        content: string
        language: string
        isMarkdown: boolean
        tooLarge?: boolean
      }
      if (result.tooLarge) {
        setPreviewFile({
          path: filePath,
          content: '',
          language: result.language,
          isMarkdown: false
        })
      } else {
        setPreviewFile({
          path: filePath,
          content: result.content,
          language: result.language,
          isMarkdown: result.isMarkdown
        })
      }
      setActiveTab('preview')
    } catch (err) {
      console.error('预览文件失败:', err)
    } finally {
      setLoading(false)
    }
  }, [setPreviewFile, setActiveTab, setLoading])

  /** 切换标签时加载数据 */
  useEffect(() => {
    if (activeTab === 'changes' && changedFiles.length === 0) {
      loadChanges()
    } else if (activeTab === 'files' && fileTree.length === 0) {
      loadFileTree()
    }
  }, [activeTab, changedFiles.length, fileTree.length, loadChanges, loadFileTree])

  /** 面板打开时加载初始数据 */
  useEffect(() => {
    if (isOpen) {
      loadChanges()
    }
  }, [isOpen, loadChanges])

  /** 刷新当前标签数据 */
  const handleRefresh = useCallback(() => {
    if (activeTab === 'changes') {
      setChangedFiles([])
      loadChanges()
    } else if (activeTab === 'files') {
      setFileTree([])
      loadFileTree()
    }
  }, [activeTab, setChangedFiles, setFileTree, loadChanges, loadFileTree])

  const tabLabels: Record<string, string> = {
    changes: '变更',
    files: '文件',
    preview: '预览'
  }

  return (
    <div
      ref={panelRef}
      className={`changes-panel ${animState === 'entering' ? 'changes-panel--entering' : 'changes-panel--visible'}`}
      role="complementary"
      aria-label="变更面板"
    >
      {/* 头部 */}
      <div className="changes-panel-header">
        <h2 className="changes-panel-title">变更面板</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="changes-panel-close"
            onClick={handleRefresh}
            title="刷新"
            aria-label="刷新"
          >
            {React.createElement(Refresh, { size: 16, fill: 'currentColor', theme: 'outline' })}
          </button>
          <button
            className="changes-panel-close"
            onClick={close}
            title="关闭"
            aria-label="关闭变更面板"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 标签栏 */}
      <div className="changes-tabs" role="tablist">
        {(['changes', 'files', 'preview'] as const).map((tab) => (
          <button
            key={tab}
            className={`changes-tab ${activeTab === tab ? 'changes-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
            role="tab"
            aria-selected={activeTab === tab}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="changes-content" role="tabpanel">
        {loading && <div className="changes-loading">加载中…</div>}

        {!loading && activeTab === 'changes' && (
          <>
            {changedFiles.length === 0 ? (
              <div className="changes-empty">
                <span className="changes-empty-icon">{React.createElement(Magic, { size: 32, fill: '#9ca3af', theme: 'outline' })}</span>
                <span>没有变更的文件</span>
              </div>
            ) : (
              <ul className="changes-file-list">
                {changedFiles.map((file) => (
                  <li key={file.path}>
                    <button
                      className="changes-file-item"
                      onClick={() => handlePreview(file.path)}
                      title={file.path}
                    >
                      <span className={`changes-file-status changes-file-status--${file.status}`}>
                        {STATUS_LABELS[file.status]}
                      </span>
                      <span className="changes-file-info">
                        <span className="changes-file-name">{file.path.split('/').pop()}</span>
                        <span className="changes-file-path">{file.path}</span>
                      </span>
                      {file.staged && <span className="changes-file-staged">S</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {!loading && activeTab === 'files' && (
          <FileTree nodes={fileTree} onFileClick={handlePreview} />
        )}

        {!loading && activeTab === 'preview' && (
          <>
            {previewFile ? (
              previewFile.content === '' && previewFile.path ? (
                <div className="file-preview-too-large">
                  <span className="file-preview-too-large-icon">{React.createElement(FolderOpen, { size: 32, fill: '#9ca3af', theme: 'outline' })}</span>
                  <span>文件过大，无法预览</span>
                  <span style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary, #9ca3af)' }}>
                    {previewFile.path}
                  </span>
                </div>
              ) : (
                <FilePreview file={previewFile} />
              )
            ) : (
              <div className="changes-empty">
                <span className="changes-empty-icon">👀</span>
                <span>点击文件进行预览</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
