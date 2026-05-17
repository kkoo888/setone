import React, { useState, useEffect, useCallback } from 'react'

interface TranslationRecord {
  id: string; sourceText: string; translatedText: string
  sourceLang: string; targetLang: string; isFavorite: boolean; createdAt: number
}

const LANGS: Record<string, string> = {
  'auto': '自动检测', 'zh-CN': '中文(简)', 'zh-TW': '中文(繁)',
  'en': '英语', 'ja': '日语', 'ko': '韩语', 'fr': '法语',
  'de': '德语', 'es': '西班牙语', 'ru': '俄语', 'pt': '葡萄牙语'
}

export function TranslatorPage() {
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('en')
  const [history, setHistory] = useState<TranslationRecord[]>([])
  const [favorites, setFavorites] = useState<TranslationRecord[]>([])
  const [activeTab, setActiveTab] = useState<'translate' | 'history' | 'favorites'>('translate')
  const [loading, setLoading] = useState(false)
  const [modalRecord, setModalRecord] = useState<TranslationRecord | null>(null)

  const loadHistory = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('translate_history', { action: 'list', limit: 100 })
      if (res?.success) setHistory(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  const loadFavorites = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('translate_favorites', { action: 'list' })
      if (res?.success) setFavorites(res.data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadHistory(); loadFavorites() }, [loadHistory, loadFavorites])

  const handleTranslate = async () => {
    if (!sourceText.trim()) return
    setLoading(true)
    try {
      const res = await window.electronAPI.invoke('translate_text', { text: sourceText, sourceLang, targetLang })
      if (res?.success) {
        setTranslatedText(res.data.translatedText)
        loadHistory()
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleSwapLangs = () => {
    if (sourceLang === 'auto') return
    setSourceLang(targetLang)
    setTargetLang(sourceLang)
    setSourceText(translatedText)
    setTranslatedText(sourceText)
  }

  const handleToggleFavorite = async (id: string) => {
    await window.electronAPI.invoke('translate_favorites', { action: 'toggle', id })
    loadHistory(); loadFavorites()
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.invoke('translate_history', { action: 'delete', id })
    loadHistory()
  }

  const renderRecord = (r: TranslationRecord) => (
    <div key={r.id} className="trans-record" onClick={() => setModalRecord(r)} style={{ cursor: 'pointer' }}>
      <div className="trans-record-header">
        <span className="trans-lang-badge">{LANGS[r.sourceLang] ?? r.sourceLang} → {LANGS[r.targetLang] ?? r.targetLang}</span>
        <div className="trans-record-actions">
          <button onClick={(e) => { e.stopPropagation(); handleToggleFavorite(r.id) }} className="btn-icon" title="收藏">
            {r.isFavorite ? '⭐' : '☆'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }} className="btn-icon" title="删除">🗑</button>
        </div>
      </div>
      <div className="trans-record-pair">
        <div className="trans-src">{r.sourceText}</div>
        <div className="trans-arrow">→</div>
        <div className="trans-tgt">{r.translatedText}</div>
      </div>
    </div>
  )

  return (
    <div className="trans-page">
      {/* 标题栏：标题左上，tabs 右侧对齐标题底边，分割线贯穿 */}
      <div className="trans-header">
        <div className="trans-header-left">
          <span className="trans-header-icon">🌐</span>
          <h1 className="trans-title">翻译面板</h1>
        </div>
        <div className="trans-tabs">
          {(['translate', 'history', 'favorites'] as const).map(tab => (
            <button key={tab} className={`trans-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}>
              {tab === 'translate' ? '翻译' : tab === 'history' ? '历史' : '收藏'}
            </button>
          ))}
        </div>
      </div>
      <div className="trans-header-divider" />

      {activeTab === 'translate' && (
        <div className="trans-content">
          <div className="trans-lang-bar">
            <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} className="trans-select">
              {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={handleSwapLangs} className="trans-swap-btn" title="交换语言">⇄</button>
            <select value={targetLang} onChange={e => setTargetLang(e.target.value)} className="trans-select">
              {Object.entries(LANGS).filter(([k]) => k !== 'auto').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="trans-panels">
            <div className="trans-panel">
              <label>原文</label>
              <textarea value={sourceText} onChange={e => setSourceText(e.target.value)}
                placeholder="输入待翻译文本..." className="trans-textarea" rows={8} />
            </div>
            <div className="trans-panel">
              <label>译文</label>
              <textarea value={translatedText} readOnly placeholder="翻译结果..."
                className="trans-textarea" rows={8} />
            </div>
          </div>
          <div className="trans-btn-row">
            <button onClick={handleTranslate} disabled={loading || !sourceText.trim()} className="trans-translate-btn">
              {loading ? '翻译中...' : '🌐 翻译'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="trans-content">
          {history.length === 0 ? <div className="trans-empty">暂无翻译历史</div> : (
            <div className="trans-history-list">{history.map(renderRecord)}</div>
          )}
        </div>
      )}

      {activeTab === 'favorites' && (
        <div className="trans-content">
          {favorites.length === 0 ? <div className="trans-empty">暂无收藏</div> : (
            <div className="trans-history-list">{favorites.map(renderRecord)}</div>
          )}
        </div>
      )}

      {/* 详情弹窗 */}
      {modalRecord && (
        <div className="trans-modal-overlay" onClick={() => setModalRecord(null)}>
          <div className="trans-modal" onClick={e => e.stopPropagation()}>
            <div className="trans-modal-header">
              <h3 className="trans-modal-title">翻译详情</h3>
              <button className="trans-modal-close" onClick={() => setModalRecord(null)}>✕</button>
            </div>
            <div className="trans-modal-body">
              <div className="trans-modal-panel">
                <label>原文</label>
                <div className="trans-modal-text">{modalRecord.sourceText}</div>
              </div>
              <div className="trans-modal-panel">
                <label>译文</label>
                <div className="trans-modal-text">{modalRecord.translatedText}</div>
              </div>
            </div>
            <div className="trans-modal-footer">
              <span className="trans-modal-lang">
                {LANGS[modalRecord.sourceLang] ?? modalRecord.sourceLang} → {LANGS[modalRecord.targetLang] ?? modalRecord.targetLang}
              </span>
              <div className="trans-modal-actions">
                <button className="trans-modal-btn" onClick={() => {
                  navigator.clipboard.writeText(modalRecord.sourceText)
                }}>📋 复制原文</button>
                <button className="trans-modal-btn" onClick={() => {
                  navigator.clipboard.writeText(modalRecord.translatedText)
                }}>📋 复制译文</button>
                <button className="trans-modal-btn" onClick={() => {
                  handleToggleFavorite(modalRecord.id)
                  setModalRecord({ ...modalRecord, isFavorite: !modalRecord.isFavorite })
                }}>{modalRecord.isFavorite ? '⭐ 取消收藏' : '☆ 收藏'}</button>
                <button className="trans-modal-btn trans-modal-btn-danger" onClick={() => {
                  handleDelete(modalRecord.id)
                  setModalRecord(null)
                }}>🗑 删除</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
