import React, { useState, useEffect, useCallback } from 'react'
import { KBDocument, KBSearchResult, KBAskResult } from '../types/knowledge-base'

export function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<KBDocument[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KBSearchResult[]>([])
  const [askQuestion, setAskQuestion] = useState('')
  const [askResult, setAskResult] = useState<KBAskResult | null>(null)
  const [importPath, setImportPath] = useState('')
  const [activeTab, setActiveTab] = useState<'docs' | 'search' | 'ask'>('docs')
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
    <div className="kb-page">
      <div className="kb-header">
        <h1>📚 知识库</h1>
        <div className="kb-tabs">
          {(['docs', 'search', 'ask'] as const).map(tab => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}>
              {tab === 'docs' ? '📄 文档管理' : tab === 'search' ? '🔍 语义搜索' : '💡 RAG问答'}
            </button>
          ))}
        </div>
      </div>

      {message && <div className="kb-message">{message}</div>}

      {activeTab === 'docs' && (
        <div className="kb-section">
          <div className="kb-import-bar">
            <input value={importPath} onChange={e => setImportPath(e.target.value)}
              placeholder="输入文件或目录路径，或点击浏览选择..." className="kb-input" />
            <button onClick={() => setShowImportDialog(true)} className="btn btn-secondary">
              📂 浏览
            </button>
            <button onClick={handleImport} disabled={loading || !importPath.trim()} className="btn btn-primary">
              {loading ? '导入中...' : '📥 导入'}
            </button>
          </div>
          <div className="kb-doc-list">
            {documents.length === 0 ? (
              <div className="kb-empty">暂无文档，请导入文件</div>
            ) : documents.map(doc => (
              <div key={doc.id} className="kb-doc-item">
                <div className="kb-doc-info">
                  <span className="kb-doc-name">{doc.fileName}</span>
                  <span className="kb-doc-meta">{doc.fileType} · {doc.chunkCount} 片段</span>
                </div>
                <button onClick={() => handleDelete(doc.id)} className="btn btn-danger btn-sm">删除</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'search' && (
        <div className="kb-section">
          <div className="kb-import-bar">
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="输入搜索内容..." className="kb-input" />
            <button onClick={handleSearch} disabled={loading} className="btn btn-primary">
              {loading ? '搜索中...' : '🔍 搜索'}
            </button>
          </div>
          <div className="kb-results">
            {searchResults.map(r => (
              <div key={r.chunkId} className="kb-result-item">
                <div className="kb-result-header">
                  <span className="kb-result-file">{r.fileName}</span>
                  <span className="kb-result-score">相关度 {(r.score * 100).toFixed(1)}%</span>
                </div>
                <div className="kb-result-content">{r.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ask' && (
        <div className="kb-section">
          <div className="kb-import-bar">
            <input value={askQuestion} onChange={e => setAskQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAsk()}
              placeholder="输入问题..." className="kb-input" />
            <button onClick={handleAsk} disabled={loading} className="btn btn-primary">
              {loading ? '思考中...' : '💡 提问'}
            </button>
          </div>
          {askResult && (
            <div className="kb-ask-result">
              <div className="kb-ask-answer">{askResult.answer}</div>
              {askResult.sources.length > 0 && (
                <div className="kb-ask-sources">
                  <h4>参考来源</h4>
                  {askResult.sources.map(s => (
                    <div key={s.chunkId} className="kb-source-item">
                      <span>{s.fileName}</span> — <span>{s.content.slice(0, 100)}...</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showImportDialog && (
        <div className="dialog-overlay" onClick={() => setShowImportDialog(false)}>
          <div className="dialog-panel" onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <h2>导入到知识库</h2>
              <button className="dialog-close" onClick={() => setShowImportDialog(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <div className="import-mode-tabs">
                <button
                  className={`tab-btn ${importMode === 'file' ? 'active' : ''}`}
                  onClick={() => setImportMode('file')}
                >
                  📄 选择文件
                </button>
                <button
                  className={`tab-btn ${importMode === 'folder' ? 'active' : ''}`}
                  onClick={() => setImportMode('folder')}
                >
                  📁 选择文件夹
                </button>
              </div>
              <div className="import-browse-area">
                <p className="import-hint">
                  {importMode === 'file'
                    ? '选择要导入的文件（支持 txt、md、pdf、doc、代码文件等）'
                    : '选择要导入的文件夹，文件夹内的所有文档将被导入'}
                </p>
                <button className="btn btn-primary" onClick={() => handleBrowse(importMode)}>
                  {importMode === 'file' ? '📂 选择文件' : '📂 选择文件夹'}
                </button>
                {importPath && (
                  <p className="import-selected">已选择：{importPath}</p>
                )}
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setShowImportDialog(false)}>取消</button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={loading || !importPath.trim()}
              >
                {loading ? '导入中...' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
