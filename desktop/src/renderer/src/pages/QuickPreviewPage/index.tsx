import React, { useState, useCallback } from 'react'

interface PreviewResult { path: string; content: string; type: string; size: number; modified: number }

export function QuickPreviewPage() {
  const [filePath, setFilePath] = useState('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recentFiles, setRecentFiles] = useState<string[]>([])

  const handlePreview = useCallback(async (path?: string) => {
    const target = path ?? filePath
    if (!target.trim()) return
    setLoading(true); setError('')
    try {
      const res = await window.electronAPI.invoke('file_preview', { path: target })
      if (res?.success) {
        setPreview(res.data)
        setRecentFiles(prev => [target, ...prev.filter(f => f !== target)].slice(0, 20))
      } else {
        setError(res?.error ?? '预览失败')
      }
    } catch (e) { setError((e as Error).message) }
    setLoading(false)
  }, [filePath])

  const handleOpenFile = async () => {
    try {
      const res = await window.electronAPI.invoke('file_open_dialog')
      if (res?.success && res.data) { setFilePath(res.data); handlePreview(res.data) }
    } catch { /* ignore */ }
  }

  const ext = preview?.path.split('.').pop()?.toLowerCase() ?? ''
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
  const isCode = ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'md', 'sh', 'sql'].includes(ext)
  const isText = ['txt', 'log', 'csv', 'xml', 'ini', 'cfg', 'conf', 'env'].includes(ext)

  return (
    <div className="preview-page">
      <div className="preview-header">
        <h1>👁 快速预览</h1>
      </div>
      <div className="preview-toolbar">
        <input value={filePath} onChange={e => setFilePath(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handlePreview()}
          placeholder="输入文件路径..." className="preview-input" />
        <button onClick={() => handlePreview()} disabled={loading} className="btn btn-primary">
          {loading ? '加载中...' : '👁 预览'}
        </button>
        <button onClick={handleOpenFile} className="btn">📂 浏览</button>
      </div>
      {error && <div className="preview-error">{error}</div>}
      {preview && (
        <div className="preview-content">
          <div className="preview-meta">
            <span>📄 {preview.path.split('/').pop()}</span>
            <span>{(preview.size / 1024).toFixed(1)} KB</span>
            <span>{new Date(preview.modified).toLocaleString()}</span>
          </div>
          <div className="preview-body">
            {isImage ? (
              <img src={`file://${preview.path}`} alt={preview.path} className="preview-image" />
            ) : isCode || isText ? (
              <pre className="preview-code"><code>{preview.content}</code></pre>
            ) : (
              <pre className="preview-text">{preview.content}</pre>
            )}
          </div>
        </div>
      )}
      {recentFiles.length > 0 && (
        <div className="preview-recent">
          <h3>最近预览</h3>
          {recentFiles.map(f => (
            <div key={f} className="preview-recent-item" onClick={() => { setFilePath(f); handlePreview(f) }}>
              📄 {f}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
