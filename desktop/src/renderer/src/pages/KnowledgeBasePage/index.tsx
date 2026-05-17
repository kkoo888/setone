import React, { useState, useEffect, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleList, ModuleListItem, ModuleModal } from '../../components/common/module/ModuleList'
import { KBDocument, KBSearchResult, KBAskResult } from '../types/knowledge-base'

export function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<KBDocument[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KBSearchResult[]>([])
  const [askQuestion, setAskQuestion] = useState('')
  const [askResult, setAskResult] = useState<KBAskResult | null>(null)
  const [importPath, setImportPath] = useState('')
  const [activeTab, setActiveTab] = useState('docs')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importMode, setImportMode] = useState<'file' | 'folder'>('file')

  const loadDocuments = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('kb_list')
      if (res?.success) setDocuments(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadDocuments() }, [loadDocuments])

  const handleImport = async () => {
    if (!importPath.trim()) return
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

  return (
    <div className="mod-page">
      <ModuleHeader
        icon="📚"
        title="知识库"
        tabs={[
          { key: 'docs', label: '📄 文档管理', count: documents.length },
          { key: 'search', label: '🔍 语义搜索' },
          { key: 'ask', label: '💡 RAG问答' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {message && (
        <div style={{ padding: '0 24px', animation: 'scSlideDown 0.2s ease' }}>
          <div style={{ padding: '10px 16px', borderRadius: 8, fontSize: 13, background: message.includes('失败') || message.includes('错误') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: message.includes('失败') || message.includes('错误') ? 'var(--color-error)' : 'var(--color-success)', border: `1px solid ${message.includes('失败') || message.includes('错误') ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
            {message}
          </div>
        </div>
      )}

      {activeTab === 'docs' && (
        <>
          <div style={{ padding: '12px 24px', display: 'flex', gap: 8, borderTop: '1px solid var(--color-border)' }}>
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

      {activeTab === 'search' && (
        <>
          <div style={{ padding: '12px 24px', display: 'flex', gap: 8, borderTop: '1px solid var(--color-border)' }}>
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

      {activeTab === 'ask' && (
        <>
          <div style={{ padding: '12px 24px', display: 'flex', gap: 8, borderTop: '1px solid var(--color-border)' }}>
            <input value={askQuestion} onChange={e => setAskQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAsk()} placeholder="输入问题..." className="mod-search" style={{ maxWidth: 'none', flex: 1 }} />
            <button onClick={handleAsk} disabled={loading} className="btn btn-primary">
              {loading ? '思考中...' : '💡 提问'}
            </button>
          </div>
          {askResult && (
            <div style={{ padding: '0 24px 24px' }}>
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

      {/* 导入弹窗 */}
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
    </div>
  )
}
