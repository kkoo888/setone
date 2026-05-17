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
    <div key={r.id} className="trans-record">
      <div className="trans-record-header">
        <span className="trans-lang-badge">{LANGS[r.sourceLang] ?? r.sourceLang} → {LANGS[r.targetLang] ?? r.targetLang}</span>
        <div className="trans-record-actions">
          <button onClick={() => handleToggleFavorite(r.id)} className="btn-icon" title="收藏">
            {r.isFavorite ? '⭐' : '☆'}
          </button>
          <button onClick={() => handleDelete(r.id)} className="btn-icon" title="删除">🗑</button>
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
      <div className="trans-header">
        <h1>🌐 翻译面板</h1>
        <div className="trans-tabs">
          {(['translate', 'history', 'favorites'] as const).map(tab => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}>
              {tab === 'translate' ? '翻译' : tab === 'history' ? '📋 历史' : '⭐ 收藏'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'translate' && (
        <div className="trans-section">
          <div className="trans-lang-bar">
            <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} className="trans-select">
              {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={handleSwapLangs} className="btn-icon" title="交换语言">⇄</button>
            <select value={targetLang} onChange={e => setTargetLang(e.target.value)} className="trans-select">
              {Object.entries(LANGS).filter(([k]) => k !== 'auto').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="trans-io">
            <textarea value={sourceText} onChange={e => setSourceText(e.target.value)}
              placeholder="输入待翻译文本..." className="trans-textarea" rows={6} />
            <textarea value={translatedText} readOnly placeholder="翻译结果..."
              className="trans-textarea trans-result" rows={6} />
          </div>
          <button onClick={handleTranslate} disabled={loading || !sourceText.trim()} className="btn btn-primary">
            {loading ? '翻译中...' : '🌐 翻译'}
          </button>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="trans-section">
          {history.length === 0 ? <div className="trans-empty">暂无翻译历史</div> : history.map(renderRecord)}
        </div>
      )}

      {activeTab === 'favorites' && (
        <div className="trans-section">
          {favorites.length === 0 ? <div className="trans-empty">暂无收藏</div> : favorites.map(renderRecord)}
        </div>
      )}
    </div>
  )
}
