import React, { useState, useEffect, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleList, ModuleListItem, ModuleModal } from '../../components/common/module/ModuleList'
import { KBDocument, KBSearchResult, KBAskResult } from '../types/knowledge-base'

/** 数据集信息 */
interface DatasetInfo {
  id: string
  name: string
  category: string
  downloads: string
  size: string
  description: string
  url: string
  relevance: string
  tags: string[]
}

/** 下载进度 */
interface DownloadProgress {
  datasetId: string
  datasetName: string
  state: string
  receivedBytes: number
  totalBytes: number
  percent: number
  savePath: string
}

/** 去掉类别名称中的编号前缀（如"一、""二、""1.""(1)"等） */
function stripCategoryPrefix(name: string): string {
  return name
    .replace(/^[一二三四五六七八九十]+[、.．]\s*/u, '')
    .replace(/^\d+[、.．]\s*/, '')
    .replace(/^\(\d+\)\s*/, '')
    .replace(/^（\d+）\s*/, '')
    .trim()
}

/** 分类颜色映射（key 为去编号后的标准名） */
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  '百科评估': { bg: 'rgba(99,102,241,0.1)', text: 'var(--color-accent)' },
  '指令对话': { bg: 'rgba(34,197,94,0.1)', text: 'var(--color-success)' },
  '数学推理': { bg: 'rgba(251,191,36,0.1)', text: '#d97706' },
  '专业领域': { bg: 'rgba(236,72,153,0.1)', text: '#ec4899' },
  '语音': { bg: 'rgba(168,85,247,0.1)', text: '#a855f7' },
  '视觉OCR': { bg: 'rgba(14,165,233,0.1)', text: '#0ea5e9' },
  '通用语料': { bg: 'rgba(107,114,128,0.1)', text: 'var(--color-text-secondary)' },
}

/** 标准化分类名：去编号 + 聚合同义词 */
function normalizeCategory(raw: string): string {
  const stripped = stripCategoryPrefix(raw)
  // 聚合同义/近义分类
  const synonyms: Record<string, string[]> = {
    '百科评估': ['百科', '评估', '知识评估'],
    '指令对话': ['指令', '对话', '对话指令'],
    '数学推理': ['数学', '推理', '数学推理'],
    '专业领域': ['专业', '领域', '医疗', '法律', '金融'],
    '语音': ['语音', '音频', 'ASR', 'TTS'],
    '视觉OCR': ['视觉', 'OCR', '图像', '图片'],
    '通用语料': ['通用', '语料', '文本'],
  }
  for (const [canonical, aliases] of Object.entries(synonyms)) {
    if (stripped === canonical || aliases.some(a => stripped.includes(a))) return canonical
  }
  return stripped
}

export function KnowledgeBasePage() {
  // ── 文档管理 ──
  const [documents, setDocuments] = useState<KBDocument[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KBSearchResult[]>([])
  const [askQuestion, setAskQuestion] = useState('')
  const [askResult, setAskResult] = useState<KBAskResult | null>(null)
  const [importPath, setImportPath] = useState('')
  const [activeTab, setActiveTab] = useState('datasets')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importMode, setImportMode] = useState<'file' | 'folder'>('file')
  const [networkEnabled, setNetworkEnabled] = useState(true)

  // ── 数据集广场 ──
  const [datasets, setDatasets] = useState<DatasetInfo[]>([])
  const [datasetCategories, setDatasetCategories] = useState<string[]>(['全部'])
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [loadingDatasets, setLoadingDatasets] = useState(false)
  const [downloads, setDownloads] = useState<Map<string, DownloadProgress>>(new Map())
  const [showDownloadConfirm, setShowDownloadConfirm] = useState<DatasetInfo | null>(null)

  // ── 加载数据 ──
  const loadDocuments = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('kb_list')
      if (res?.success) setDocuments(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  const loadNetworkStatus = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('kb_network_status')
      if (res?.success) setNetworkEnabled(res.data.networkEnabled ?? true)
    } catch { /* ignore */ }
  }, [])

  const loadDatasets = useCallback(async () => {
    setLoadingDatasets(true)
    try {
      const res = await window.electronAPI.invoke('kb_dataset_list', { category: selectedCategory === '全部' ? undefined : selectedCategory })
      if (res?.success) {
        setDatasets(res.data.datasets ?? [])
        // 去编号 + 聚合类似分类
        const rawCats: string[] = res.data.categories ?? ['全部']
        const normalized = rawCats.map(c => c === '全部' ? '全部' : normalizeCategory(c))
        const unique = ['全部', ...Array.from(new Set(normalized.filter(c => c !== '全部')))]
        setDatasetCategories(unique)
      }
    } catch { /* ignore */ }
    setLoadingDatasets(false)
  }, [selectedCategory])

  useEffect(() => { loadDocuments(); loadNetworkStatus(); loadDatasets() }, [loadDocuments, loadNetworkStatus, loadDatasets])

  // ── 监听下载进度 ──
  useEffect(() => {
    const handler = (_event: unknown, progress: DownloadProgress) => {
      setDownloads(prev => {
        const next = new Map(prev)
        next.set(progress.datasetId, progress)
        return next
      })
      if (progress.state === 'completed') {
        setMessage(`✅ "${progress.datasetName}" 下载完成！`)
        loadDatasets()
      } else if (progress.state === 'cancelled') {
        setMessage(`❌ "${progress.datasetName}" 下载已取消`)
      }
    }

    // @ts-expect-error - Electron IPC listener
    window.electronAPI.on?.('kb_dataset_download_progress', handler)
    return () => {
      // @ts-expect-error
      window.electronAPI.off?.('kb_dataset_download_progress', handler)
    }
  }, [loadDatasets])

  // ── 联网切换 ──
  const handleToggleNetwork = async () => {
    try {
      const newState = !networkEnabled
      const res = await window.electronAPI.invoke('kb_network_status', { enabled: newState })
      if (res?.success) {
        setNetworkEnabled(newState)
        setMessage(newState ? '✅ 联网功能已开启' : '⚠️ 联网功能已关闭（本地文件操作和已有向量搜索不受影响）')
      }
    } catch (e) { setMessage(`切换失败：${(e as Error).message}`) }
  }

  // ── 文档导入 ──
  const handleImport = async () => {
    if (!importPath.trim()) return
    // 网络地址需要联网，本地路径不需要
    const isRemotePath = /^https?:\/\//i.test(importPath.trim())
    if (isRemotePath && !networkEnabled) {
      setMessage('⚠️ 当前处于断网状态，无法从网络地址导入。请使用本地路径或开启联网功能')
      return
    }
    setLoading(true)
    try {
      const res = await window.electronAPI.invoke('kb_import', { path: importPath })
      if (res?.success) {
        setMessage(`导入完成：${res.data.success} 成功，${res.data.failed} 失败`)
        setImportPath('')
        loadDocuments()
      } else {
        setMessage(`导入失败：${res?.error}`)
      }
    } catch (e) { setMessage(`错误：${(e as Error).message}`) }
    setLoading(false)
  }

  // ── 搜索 / 问答 ──
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    try {
      const res = await window.electronAPI.invoke('kb_search', { query: searchQuery, topK: 10 })
      if (res?.success) setSearchResults(res.data ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleAsk = async () => {
    if (!askQuestion.trim()) return
    setLoading(true)
    try {
      const res = await window.electronAPI.invoke('kb_ask', { question: askQuestion, topK: 5 })
      if (res?.success) setAskResult(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleDelete = async (docId: string) => {
    try {
      await window.electronAPI.invoke('kb_delete', { documentId: docId })
      loadDocuments()
    } catch { /* ignore */ }
  }

  const handleBrowse = async (mode: 'file' | 'folder') => {
    try {
      const properties = mode === 'folder' ? ['openDirectory'] : ['openFile']
      const filters = mode === 'file' ? [
        { name: '文档', extensions: ['txt', 'md', 'pdf', 'doc', 'docx', 'json', 'csv'] },
        { name: '代码', extensions: ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'css', 'html'] },
        { name: '所有文件', extensions: ['*'] }
      ] : undefined
      const result = await window.electronAPI.invoke('dialog:openFile', { properties, filters }) as { canceled?: boolean; filePaths?: string[] }
      if (!result?.canceled && result?.filePaths?.[0]) {
        setImportPath(result.filePaths[0])
        setShowImportDialog(false)
      }
    } catch { /* ignore */ }
  }

  // ── 远程加载数据集 ──
  const handleFetchRemote = async () => {
    if (!remoteUrl.trim()) return
    if (!networkEnabled) {
      setMessage('⚠️ 当前处于断网状态，无法加载远程数据集。请先在设置中开启联网功能')
      return
    }
    setLoadingDatasets(true)
    try {
      const res = await window.electronAPI.invoke('kb_dataset_fetch_remote', { url: remoteUrl })
      if (res?.success) {
        setMessage(`✅ ${res.data.message}`)
        loadDatasets()
      } else {
        setMessage(`❌ 加载失败：${res?.error}`)
      }
    } catch (e) { setMessage(`❌ 错误：${(e as Error).message}`) }
    setLoadingDatasets(false)
  }

  // ── 下载数据集 ──
  const handleDownloadClick = (dataset: DatasetInfo) => {
    setShowDownloadConfirm(dataset)
  }

  // ── 点击卡片 → 显示详情弹窗 ──
  const handleCardClick = (dataset: DatasetInfo) => {
    setShowDownloadConfirm(dataset)
  }

  const handleConfirmDownload = () => {
    if (!showDownloadConfirm) return
    if (!networkEnabled) {
      setMessage('⚠️ 当前处于断网状态，无法下载数据集。请先在设置中开启联网功能')
      setShowDownloadConfirm(null)
      return
    }
    const dataset = showDownloadConfirm
    setShowDownloadConfirm(null)

    // 调用 Electron IPC 开始下载
    // @ts-expect-error - Electron IPC send
    window.electronAPI.send?.('kb_dataset_download_start', dataset.id, dataset.name, dataset.url)

    // 初始化下载状态
    setDownloads(prev => {
      const next = new Map(prev)
      next.set(dataset.id, {
        datasetId: dataset.id,
        datasetName: dataset.name,
        state: 'pending',
        receivedBytes: 0,
        totalBytes: 0,
        percent: 0,
        savePath: ''
      })
      return next
    })

    // 兜底：如果 5 秒后仍为 pending，自动转为 downloading 防止卡住
    setTimeout(() => {
      setDownloads(prev => {
        const dl = prev.get(dataset.id)
        if (dl && dl.state === 'pending') {
          const next = new Map(prev)
          next.set(dataset.id, { ...dl, state: 'downloading' })
          return next
        }
        return prev
      })
    }, 5000)
  }

  const handleCancelDownload = (datasetId: string) => {
    // @ts-expect-error
    window.electronAPI.send?.('kb_dataset_download_cancel', datasetId)
    setDownloads(prev => {
      const next = new Map(prev)
      next.delete(datasetId)
      return next
    })
  }

  // ── 格式化字节 ──
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // ── 获取下载按钮状态 ──
  const renderDownloadButton = (dataset: DatasetInfo) => {
    const dl = downloads.get(dataset.id)
    if (!dl) {
      return (
        <button
          onClick={e => { e.stopPropagation(); handleCardClick(dataset) }}
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '4px 12px', whiteSpace: 'nowrap' }}
        >
          📥 下载
        </button>
      )
    }

    if (dl.state === 'completed') {
      return (
        <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600 }}>✅ 已完成</span>
      )
    }

    if (dl.state === 'pending') {
      return (
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>⏳ 准备中...</span>
      )
    }

    if (dl.state === 'downloading') {
      return (
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
          <div style={{ flex: 1, height: 6, background: 'var(--color-bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${dl.percent}%`, height: '100%', borderRadius: 3,
              background: 'var(--color-accent)', transition: 'width 0.3s ease'
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
            {dl.percent}%
          </span>
          <button
            onClick={() => handleCancelDownload(dataset.id)}
            style={{ fontSize: 11, padding: '2px 6px', background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}
            title="取消下载"
          >
            ✕
          </button>
        </div>
      )
    }

    return null
  }

  return (
    <div className="mod-page">
      <ModuleHeader
        icon="📚"
        title="知识库"
        tabs={[
          { key: 'datasets', label: '🌐 数据集广场', count: datasets.length },
          { key: 'docs', label: '📄 文档管理', count: documents.length },
          { key: 'search', label: '🔍 语义搜索' },
          { key: 'ask', label: '💡 RAG问答' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* 消息提示 */}
      {message && (
        <div style={{ padding: '0 12px', animation: 'scSlideDown 0.2s ease' }}>
          <div style={{ padding: '10px 16px', borderRadius: 8, fontSize: 13, background: message.includes('失败') || message.includes('错误') || message.includes('❌') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: message.includes('失败') || message.includes('错误') || message.includes('❌') ? 'var(--color-error)' : 'var(--color-success)', border: `1px solid ${message.includes('失败') || message.includes('错误') || message.includes('❌') ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
            {message}
          </div>
        </div>
      )}

      {/* ══════════ 数据集广场 ══════════ */}
      {activeTab === 'datasets' && (
        <>
          {/* 远程导入栏 */}
          <div style={{ padding: '12px 12px', display: 'flex', gap: 8 }}>
            <input
              value={remoteUrl}
              onChange={e => setRemoteUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetchRemote()}
              placeholder="输入数据集目录的 Markdown 地址（如 GitHub URL）..."
              className="mod-search"
              style={{ maxWidth: 'none', flex: 1 }}
            />
            <button onClick={handleFetchRemote} disabled={loadingDatasets || !remoteUrl.trim()} className="btn btn-primary">
              {loadingDatasets ? '加载中...' : '🔗 解析导入'}
            </button>
          </div>

          {/* 分类筛选 */}
          <div style={{ padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {datasetCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`mod-filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                style={{ fontSize: 12 }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* 数据集列表 */}
          <div style={{ padding: '0 12px 12px', overflow: 'auto', flex: 1 }}>
            {datasets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)' }}>
                <div style={{ fontSize: 48, opacity: 0.3, marginBottom: 12 }}>🌐</div>
                <div>暂无数据集，请输入远程地址加载</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
                {datasets.map(ds => {
                  const catColor = CATEGORY_COLORS[normalizeCategory(ds.category)] ?? CATEGORY_COLORS['通用语料']
                  return (
                    <div
                      key={ds.id}
                      onClick={() => handleCardClick(ds)}
                      style={{
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 12,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        transition: 'all var(--transition-fast)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = '#fff'
                        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.3)'
                        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-secondary)'
                        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'
                        ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
                      }}
                    >
                      {/* 头部：名称 + 状态 */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ds.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {ds.description}
                          </div>
                        </div>
                        {renderDownloadButton(ds)}
                      </div>

                      {/* 标签行 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 4,
                          background: catColor.bg, color: catColor.text, fontWeight: 500
                        }}>
                          {normalizeCategory(ds.category)}
                        </span>
                        {ds.size && ds.size !== '—' && (
                          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>📦 {ds.size}</span>
                        )}
                        {ds.downloads && (
                          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>⬇️ {ds.downloads}</span>
                        )}
                        {ds.tags.slice(0, 3).map(tag => (
                          <span key={tag} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════ 文档管理 ══════════ */}
      {activeTab === 'docs' && (
        <>
          <div style={{ padding: '12px 12px', display: 'flex', gap: 8 }}>
            <input value={importPath} onChange={e => setImportPath(e.target.value)} placeholder="输入文件或目录路径，或点击浏览选择..." className="mod-search" style={{ maxWidth: 'none', flex: 1 }} />
            <button onClick={() => setShowImportDialog(true)} className="btn">📂 浏览</button>
            <button onClick={handleImport} disabled={loading || !importPath.trim()} className="btn btn-primary">
              {loading ? '导入中...' : '📥 导入'}
            </button>
          </div>
          <ModuleList emptyText="暂无文档，请导入文件" emptyIcon="📚">
            {documents.map(doc => (
              <ModuleListItem
                key={doc.id}
                id={doc.id}
                icon="📄"
                title={doc.fileName}
                subtitle={`${doc.fileType} · ${doc.chunkCount} 片段`}
                actions={<button onClick={() => handleDelete(doc.id)} className="btn-icon-lg" title="删除">🗑</button>}
              />
            ))}
          </ModuleList>
        </>
      )}

      {/* ══════════ 语义搜索 ══════════ */}
      {activeTab === 'search' && (
        <>
          <div style={{ padding: '12px 12px', display: 'flex', gap: 8 }}>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="输入搜索内容..." className="mod-search" style={{ maxWidth: 'none', flex: 1 }} />
            <button onClick={handleSearch} disabled={loading} className="btn btn-primary">
              {loading ? '搜索中...' : '🔍 搜索'}
            </button>
          </div>
          <ModuleList emptyText="输入关键词开始语义搜索" emptyIcon="🔍">
            {searchResults.map(r => (
              <ModuleListItem
                key={r.chunkId}
                id={r.chunkId}
                icon="📄"
                title={r.fileName}
                subtitle={r.content}
                badge={<span style={{ fontSize: 11, color: 'var(--color-accent)', background: 'rgba(99,102,241,0.1)', padding: '1px 6px', borderRadius: 4 }}>相关度 {(r.score * 100).toFixed(1)}%</span>}
              />
            ))}
          </ModuleList>
        </>
      )}

      {/* ══════════ RAG 问答 ══════════ */}
      {activeTab === 'ask' && (
        <>
          <div style={{ padding: '12px 12px', display: 'flex', gap: 8 }}>
            <input value={askQuestion} onChange={e => setAskQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAsk()} placeholder="输入问题..." className="mod-search" style={{ maxWidth: 'none', flex: 1 }} />
            <button onClick={handleAsk} disabled={loading} className="btn btn-primary">
              {loading ? '思考中...' : '💡 提问'}
            </button>
          </div>
          {askResult && (
            <div style={{ padding: '0 12px 12px' }}>
              <div style={{ padding: 16, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{askResult.answer}</div>
              </div>
              {askResult.sources.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>参考来源</div>
                  {askResult.sources.map(s => (
                    <div key={s.chunkId} style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>
                      📄 {s.fileName} — {s.content.slice(0, 100)}...
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════ 导入弹窗 ══════════ */}
      {showImportDialog && (
        <ModuleModal title="导入到知识库" onClose={() => setShowImportDialog(false)} footer={
          <>
            <button className="btn" onClick={() => setShowImportDialog(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleImport} disabled={loading || !importPath.trim()}>
              {loading ? '导入中...' : '确认导入'}
            </button>
          </>
        }>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className={`mod-filter-btn ${importMode === 'file' ? 'active' : ''}`} onClick={() => setImportMode('file')}>📄 选择文件</button>
            <button className={`mod-filter-btn ${importMode === 'folder' ? 'active' : ''}`} onClick={() => setImportMode('folder')}>📁 选择文件夹</button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
            {importMode === 'file' ? '支持 txt、md、pdf、doc、代码文件等' : '文件夹内的所有文档将被导入'}
          </p>
          <button className="btn btn-primary" onClick={() => handleBrowse(importMode)}>
            {importMode === 'file' ? '📂 选择文件' : '📂 选择文件夹'}
          </button>
          {importPath && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>已选择：{importPath}</p>}
        </ModuleModal>
      )}

      {/* ══════════ 数据集详情弹窗 ══════════ */}
      {showDownloadConfirm && (() => {
        const dl = downloads.get(showDownloadConfirm.id)
        const isDownloading = dl && (dl.state === 'pending' || dl.state === 'downloading')
        const isCompleted = dl?.state === 'completed'
        const catColor = CATEGORY_COLORS[normalizeCategory(showDownloadConfirm.category)] ?? CATEGORY_COLORS['通用语料']
        return (
          <ModuleModal title="数据集详情" onClose={() => setShowDownloadConfirm(null)} footer={
            <>
              <button className="btn" onClick={() => setShowDownloadConfirm(null)}>
                {isCompleted ? '关闭' : '取消'}
              </button>
              {!isCompleted && (
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmDownload}
                  disabled={!!isDownloading}
                  style={{ opacity: isDownloading ? 0.6 : 1 }}
                >
                  {isDownloading ? '⏳ 下载中...' : '📥 下载'}
                </button>
              )}
            </>
          }>
            <div style={{ padding: '8px 0' }}>
              {/* 名称 */}
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12 }}>
                {showDownloadConfirm.name}
              </div>

              {/* 标签行 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <span style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 4,
                  background: catColor.bg, color: catColor.text, fontWeight: 500
                }}>
                  {normalizeCategory(showDownloadConfirm.category)}
                </span>
                {showDownloadConfirm.size && showDownloadConfirm.size !== '—' && (
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>📦 {showDownloadConfirm.size}</span>
                )}
                {showDownloadConfirm.downloads && (
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>⬇️ {showDownloadConfirm.downloads}</span>
                )}
              </div>

              {/* 描述 */}
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
                {showDownloadConfirm.description}
              </div>

              {/* 标签 */}
              {showDownloadConfirm.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {showDownloadConfirm.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 下载进度（如果正在下载） */}
              {dl && dl.state === 'downloading' && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                    <span>下载进度</span>
                    <span>{formatBytes(dl.receivedBytes)} / {formatBytes(dl.totalBytes)}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--color-bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${dl.percent}%`, height: '100%', borderRadius: 4, background: 'var(--color-accent)', transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-accent)', fontWeight: 600, marginTop: 4 }}>{dl.percent}%</div>
                </div>
              )}

              {/* 已完成提示 */}
              {isCompleted && (
                <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)', fontSize: 13, marginBottom: 16 }}>
                  ✅ 下载完成
                </div>
              )}

              {/* 外链 */}
              <div style={{ fontSize: 12 }}>
                <a href={showDownloadConfirm.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>
                  🔗 在 ModelScope 查看
                </a>
              </div>
            </div>
          </ModuleModal>
        )
      })()}
    </div>
  )
}
