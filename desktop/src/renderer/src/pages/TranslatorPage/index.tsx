import React, { useState, useEffect, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'
import { ModuleList, ModuleListItem, ModuleModal } from '../../components/common/module/ModuleList'

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
  const [activeTab, setActiveTab] = useState('translate')
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

  const tabs = [
    { key: 'translate', label: '翻译' },
    { key: 'history', label: '历史', count: history.length },
    { key: 'favorites', label: '收藏', count: favorites.length },
  ]

  const renderRecord = (r: TranslationRecord) => (
    <ModuleListItem
      key={r.id}
      id={r.id}
      onClick={() => setModalRecord(r)}
      title={`${LANGS[r.sourceLang] ?? r.sourceLang} → ${LANGS[r.targetLang] ?? r.targetLang}`}
      subtitle={<><span className="trans-compare-label" style={{ display: 'inline', marginBottom: 0 }}>{r.sourceText}</span> → <span style={{ fontWeight: 500 }}>{r.translatedText}</span></>}
      badge={r.isFavorite ? <span className="trans-fav-icon">⭐</span> : null}
      actions={
        <>
          <button onClick={(e) => { e.stopPropagation(); handleToggleFavorite(r.id) }} className="btn-icon-lg" title="收藏">
            {r.isFavorite ? '⭐' : '☆'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }} className="btn-icon-lg" title="删除">🗑</button>
        </>
      }
    />
  )

  return (
    <div className="mod-page">
      <ModuleHeader
        icon="🌐"
        title="翻译面板"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

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
        <ModuleList emptyText="暂无翻译历史" emptyIcon="🌐">
          {history.map(renderRecord)}
        </ModuleList>
      )}

      {activeTab === 'favorites' && (
        <ModuleList emptyText="暂无收藏" emptyIcon="⭐">
          {favorites.map(renderRecord)}
        </ModuleList>
      )}

      {/* 详情弹窗 */}
      {modalRecord && (
        <ModuleModal title="翻译详情" onClose={() => setModalRecord(null)} footer={
          <>
            <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(modalRecord.sourceText)}>📋 复制原文</button>
            <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(modalRecord.translatedText)}>📋 复制译文</button>
            <button className="btn btn-sm" onClick={() => { handleToggleFavorite(modalRecord.id); setModalRecord({ ...modalRecord, isFavorite: !modalRecord.isFavorite }) }}>
              {modalRecord.isFavorite ? '⭐ 取消收藏' : '☆ 收藏'}
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => { handleDelete(modalRecord.id); setModalRecord(null) }}>🗑 删除</button>
          </>
        }>
          <div className="trans-compare-grid">
            <div>
              <label className="trans-compare-label">原文</label>
              <div className="trans-modal-text">{modalRecord.sourceText}</div>
            </div>
            <div>
              <label className="trans-compare-label">译文</label>
              <div className="trans-modal-text">{modalRecord.translatedText}</div>
            </div>
          </div>
          <div className="trans-result-actions">
            <span className="trans-modal-lang">
              {LANGS[modalRecord.sourceLang] ?? modalRecord.sourceLang} → {LANGS[modalRecord.targetLang] ?? modalRecord.targetLang}
            </span>
          </div>
        </ModuleModal>
      )}
    </div>
  )
}
