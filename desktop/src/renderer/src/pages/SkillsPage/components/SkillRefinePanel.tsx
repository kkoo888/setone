/**
 * 炼化优化侧滑面板
 * 对已有技能进行 AI 分析和迭代优化
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useSkillStore } from '../../../stores/useSkillStore'
import type { SkillMeta } from '../../../stores/useSkillStore'

/** 分析结果 */
interface AnalyzeResult {
  suggestions: string[]
  score: number
  summary: string
}

/** 炼化结果 */
interface RefineResult {
  before: string
  after: string
  changes: string[]
}

interface SkillRefinePanelProps {
  skill: SkillMeta
  onClose: () => void
}

type PanelTab = 'preview' | 'analyze' | 'diff'

export default function SkillRefinePanel({ skill, onClose }: SkillRefinePanelProps) {
  const { loadSkills } = useSkillStore()

  const [activeTab, setActiveTab] = useState<PanelTab>('preview')
  const [currentContent, setCurrentContent] = useState('')
  const [loadingContent, setLoadingContent] = useState(true)

  // 分析状态
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null)

  // 炼化状态
  const [instruction, setInstruction] = useState('')
  const [refining, setRefining] = useState(false)
  const [refineResult, setRefineResult] = useState<RefineResult | null>(null)
  const [refineError, setRefineError] = useState<string | null>(null)

  // 应用状态
  const [applying, setApplying] = useState(false)

  /** 按 ESC 关闭 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  /** 阻止背景滚动 */
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  /** 加载技能当前内容 */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingContent(true)
      try {
        const result = await window.electronAPI.invoke('file:read', {
          path: `${skill.path}/SKILL.md`
        })
        const res = result as { success?: boolean; data?: string }
        if (!cancelled && res?.success && res.data) {
          setCurrentContent(res.data)
        }
      } catch (err) {
        console.error('[SkillRefinePanel] 加载 SKILL.md 失败:', err)
      } finally {
        if (!cancelled) setLoadingContent(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [skill.path])

  /** 点击遮罩关闭 */
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose]
  )

  /** AI 分析 */
  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true)
    setAnalyzeResult(null)
    try {
      const result = await window.electronAPI.invoke('skill:refine:analyze', {
        id: skill.id
      })
      const res = result as { success?: boolean; data?: AnalyzeResult; error?: string }
      if (res?.success && res.data) {
        setAnalyzeResult(res.data)
        setActiveTab('analyze')
      } else {
        setAnalyzeResult({
          suggestions: [res?.error ?? '分析失败，请稍后重试'],
          score: 0,
          summary: '分析失败'
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setAnalyzeResult({
        suggestions: [`分析异常: ${message}`],
        score: 0,
        summary: '分析异常'
      })
    } finally {
      setAnalyzing(false)
    }
  }, [skill.id])

  /** 执行炼化 */
  const handleRefine = useCallback(async () => {
    if (!instruction.trim()) {
      setRefineError('请输入优化指令')
      return
    }
    setRefineError(null)
    setRefining(true)
    setRefineResult(null)

    try {
      const result = await window.electronAPI.invoke('skill:refine', {
        id: skill.id,
        instruction: instruction.trim()
      })
      const res = result as {
        success?: boolean
        data?: { before?: string; after?: string; changes?: string[]; version?: string }
        error?: string
      }

      if (res?.success && res.data) {
        setRefineResult({
          before: res.data.before ?? currentContent,
          after: res.data.after ?? currentContent,
          changes: res.data.changes ?? ['内容已优化']
        })
        setActiveTab('diff')
      } else {
        setRefineError(res?.error ?? '炼化失败，请稍后重试')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setRefineError(`炼化异常: ${message}`)
    } finally {
      setRefining(false)
    }
  }, [skill.id, instruction, currentContent])

  /** 应用优化结果 */
  const handleApply = useCallback(async () => {
    if (!refineResult?.after) return
    setApplying(true)

    try {
      await window.electronAPI.invoke('file:write', {
        path: `${skill.path}/SKILL.md`,
        content: refineResult.after
      })
      setCurrentContent(refineResult.after)
      setRefineResult(null)
      setInstruction('')
      await loadSkills()
      setActiveTab('preview')
    } catch (err) {
      console.error('[SkillRefinePanel] 应用优化失败:', err)
    } finally {
      setApplying(false)
    }
  }, [refineResult, skill.path, loadSkills])

  /** Diff 行渲染 */
  const diffLines = useMemo(() => {
    if (!refineResult) return []
    const beforeLines = refineResult.before.split('\n')
    const afterLines = refineResult.after.split('\n')
    const result: Array<{ type: 'same' | 'removed' | 'added'; content: string }> = []

    // 简单逐行对比
    const maxLen = Math.max(beforeLines.length, afterLines.length)
    let i = 0
    let j = 0

    while (i < beforeLines.length || j < afterLines.length) {
      if (i < beforeLines.length && j < afterLines.length && beforeLines[i] === afterLines[j]) {
        result.push({ type: 'same', content: afterLines[j] })
        i++
        j++
      } else if (i < beforeLines.length && (j >= afterLines.length || !afterLines.includes(beforeLines[i]))) {
        result.push({ type: 'removed', content: beforeLines[i] })
        i++
      } else if (j < afterLines.length) {
        result.push({ type: 'added', content: afterLines[j] })
        j++
      } else {
        break
      }
    }

    return result
  }, [refineResult])

  return (
    <div className='skill-refine-overlay' onClick={handleOverlayClick} role='dialog' aria-modal='true' aria-label={`${skill.name} 炼化优化`}>
      <div className='skill-refine-panel'>
        {/* 头部 */}
        <div className='skill-refine-header'>
          <div className='skill-refine-header-left'>
            <span className='skill-refine-icon' aria-hidden='true'>🔥</span>
            <div className='skill-refine-title-group'>
              <h2 className='skill-refine-name'>{skill.name}</h2>
              <span className='skill-refine-version'>v{skill.version} · 炼化优化</span>
            </div>
          </div>
          <button className='skill-refine-close' onClick={onClose} aria-label='关闭'>
            ✕
          </button>
        </div>

        {/* Tab 切换 */}
        <div className='skill-refine-tabs'>
          <button
            className={`skill-refine-tab${activeTab === 'preview' ? ' active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            📄 当前内容
          </button>
          <button
            className={`skill-refine-tab${activeTab === 'analyze' ? ' active' : ''}`}
            onClick={() => setActiveTab('analyze')}
          >
            🔍 AI 分析
          </button>
          <button
            className={`skill-refine-tab${activeTab === 'diff' ? ' active' : ''}`}
            onClick={() => setActiveTab('diff')}
            disabled={!refineResult}
          >
            📊 Diff 对比
          </button>
        </div>

        {/* 内容区 */}
        <div className='skill-refine-body'>
          {/* 当前内容预览 */}
          {activeTab === 'preview' && (
            <div className='skill-refine-preview'>
              {loadingContent ? (
                <div className='skill-refine-loading'>
                  <span>⏳</span>
                  <span>加载中...</span>
                </div>
              ) : (
                <pre className='skill-refine-content'>{currentContent || '（空内容）'}</pre>
              )}
            </div>
          )}

          {/* AI 分析结果 */}
          {activeTab === 'analyze' && (
            <div className='skill-refine-analyze'>
              {!analyzeResult && !analyzing && (
                <div className='skill-refine-analyze-empty'>
                  <span className='skill-refine-analyze-empty-icon'>🔍</span>
                  <span>点击下方按钮开始 AI 分析</span>
                </div>
              )}
              {analyzing && (
                <div className='skill-refine-loading'>
                  <span>⏳</span>
                  <span>AI 分析中...</span>
                </div>
              )}
              {analyzeResult && !analyzing && (
                <>
                  <div className='skill-refine-score'>
                    <div className='skill-refine-score-bar'>
                      <div
                        className='skill-refine-score-fill'
                        style={{ width: `${analyzeResult.score}%` }}
                      />
                    </div>
                    <span className='skill-refine-score-text'>
                      质量评分: {analyzeResult.score}/100
                    </span>
                  </div>
                  <p className='skill-refine-summary'>{analyzeResult.summary}</p>
                  {analyzeResult.suggestions.length > 0 && (
                    <div className='skill-refine-suggestions'>
                      <h4 className='skill-refine-suggestions-title'>优化建议</h4>
                      <ul className='skill-refine-suggestions-list'>
                        {analyzeResult.suggestions.map((s, i) => (
                          <li key={i} className='skill-refine-suggestion-item'>
                            <span className='skill-refine-suggestion-bullet'>💡</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Diff 对比 */}
          {activeTab === 'diff' && (
            <div className='skill-refine-diff'>
              {!refineResult ? (
                <div className='skill-refine-analyze-empty'>
                  <span className='skill-refine-analyze-empty-icon'>📊</span>
                  <span>执行炼化后可查看差异对比</span>
                </div>
              ) : (
                <>
                  {refineResult.changes.length > 0 && (
                    <div className='skill-refine-changes'>
                      <h4 className='skill-refine-changes-title'>变更说明</h4>
                      <ul className='skill-refine-changes-list'>
                        {refineResult.changes.map((c, i) => (
                          <li key={i} className='skill-refine-change-item'>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className='skill-refine-diff-content'>
                    {diffLines.map((line, i) => (
                      <div key={i} className={`skill-refine-diff-line skill-refine-diff-line--${line.type}`}>
                        <span className='skill-refine-diff-marker'>
                          {line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' '}
                        </span>
                        <span className='skill-refine-diff-text'>{line.content}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 炼化输入区 */}
        <div className='skill-refine-input'>
          <div className='skill-refine-input-row'>
            <input
              type='text'
              className='skill-refine-input-field'
              placeholder='输入优化指令，例如：补充使用示例、增加错误处理说明...'
              value={instruction}
              onChange={(e) => {
                setInstruction(e.target.value)
                setRefineError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && instruction.trim() && !refining) {
                  handleRefine()
                }
              }}
              disabled={refining}
            />
            <button
              className='skill-refine-btn skill-refine-btn--refine'
              onClick={handleRefine}
              disabled={refining || !instruction.trim()}
            >
              {refining ? '⏳' : '🔥'} {refining ? '炼化中...' : '炼化'}
            </button>
          </div>
          {refineError && <p className='skill-refine-error'>{refineError}</p>}
        </div>

        {/* 底部操作栏 */}
        <div className='skill-refine-footer'>
          <button
            className='skill-refine-btn skill-refine-btn--analyze'
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? '⏳ 分析中...' : '🔍 AI 分析'}
          </button>
          <div className='skill-refine-footer-right'>
            {refineResult && (
              <button
                className='skill-refine-btn skill-refine-btn--apply'
                onClick={handleApply}
                disabled={applying}
              >
                {applying ? '⏳ 应用中...' : '✅ 应用优化'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
