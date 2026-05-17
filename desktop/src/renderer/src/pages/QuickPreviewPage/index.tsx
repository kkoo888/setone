import React, { useState, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleList, ModuleListItem } from '../../components/common/module/ModuleList'

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
    <div className="mod-page">
      <ModuleHeader icon="👁" title="快速预览" />

      <div style={{ padding: '12px 24px', display: 'flex', gap: 8, borderTop: '1px solid var(--color-border)' }}>
        <input value={filePath} onChange={e => setFilePath(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePreview()} placeholder="输入文件路径..." className="mod-search" style={{ maxWidth: 'none', flex: 1 }} />
        <button onClick={() => handlePreview()} disabled={loading} className="btn btn-primary">
          {loading ? '加载中...' : '👁 预览'}
        </button>
        <button onClick={handleOpenFile} className="btn">📂 浏览</button>
      </div>

      {error && (
        <div style={{ padding: '0 24px', color: 'var(--color-error)', fontSize: 13 }}>{error}</div>
      )}

      {preview && (
        <div style={{ padding: '0 24px 24px', flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
            <span>📄 {preview.path.split('/').pop()}</span>
            <span>{(preview.size / 1024).toFixed(1)} KB</span>
            <span>{new Date(preview.modified).toLocaleString()}</span>
          </div>
          <div style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16, overflow: 'auto' }}>
            {isImage ? (
              <img src={`file://${preview.path}`} alt={preview.path} style={{ maxWidth: '100%', borderRadius: 4 }} />
            ) : isCode || isText ? (
              <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><code>{preview.content}</code></pre>
            ) : (
              <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{preview.content}</pre>
            )}
          </div>
        </div>
      )}

      {recentFiles.length > 0 && (
        <ModuleList emptyText="" emptyIcon="">
          {recentFiles.map(f => (
            <ModuleListItem
              key={f}
              id={f}
              icon="📄"
              title={f.split('/').pop() ?? f}
              subtitle={f}
              onClick={() => { setFilePath(f); handlePreview(f) }}
            />
          ))}
        </ModuleList>
      )}
    </div>
  )
}
