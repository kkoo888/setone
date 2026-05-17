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
              placeholder="输入文件或目录路径..." className="kb-input" />
            <button onClick={handleImport} disabled={loading} className="btn btn-primary">
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
    </div>
  )
}
