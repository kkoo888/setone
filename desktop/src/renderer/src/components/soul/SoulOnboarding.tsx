/**
 * SOUL 首次引导组件
 * 通过对话式引导帮助用户创建助手人格
 */

import React, { useState, useCallback } from 'react'
import { useSoulStore } from '../../stores/useSoulStore'
import type { SoulCreateRequest } from '../../../../shared/types/soul'

/** 引导步骤 */
type OnboardingStep = 'welcome' | 'name' | 'emoji' | 'personality' | 'style' | 'confirm'

/** 可选 emoji 列表 */
const EMOJI_OPTIONS = ['🤖', '🌸', '🐱', '🦊', '🐰', '🌟', '💡', '🎯', '🔮', '🦋', '🍀', '🎪']

/** 可选性格标签 */
const TRAIT_OPTIONS = [
  '温柔', '活泼', '专业', '幽默', '细心', '博学',
  '可靠', '体贴', '亲切', '冷静', '热情', '理性',
  '俏皮', '成熟', '内敛', '健谈'
]

/** 可选说话风格 */
const STYLE_OPTIONS = [
  { value: '亲切自然', label: '亲切自然', desc: '像朋友一样聊天' },
  { value: '正式专业', label: '正式专业', desc: '严谨、有条理' },
  { value: '俏皮可爱', label: '俏皮可爱', desc: '活泼有趣' },
  { value: '简洁直接', label: '简洁直接', desc: '不废话，直奔主题' },
  { value: '温柔体贴', label: '温柔体贴', desc: '细心关怀' },
]

/** 步骤标题 */
const STEP_TITLES: Record<OnboardingStep, string> = {
  welcome: '👋 你好呀！',
  name: '✨ 我该叫什么名字？',
  emoji: '🎨 选一个代表我的 emoji 吧',
  personality: '🧩 我是什么性格？',
  style: '💬 我该怎么说话？',
  confirm: '🎉 确认一下',
}

/**
 * SOUL 首次引导界面
 */
export const SoulOnboarding: React.FC = () => {
  const { createSoul, setShowOnboarding } = useSoulStore()

  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🤖')
  const [selectedTraits, setSelectedTraits] = useState<string[]>(['亲切', '细心'])
  const [speakingStyle, setSpeakingStyle] = useState('亲切自然')

  /** 切换性格标签 */
  const toggleTrait = useCallback((trait: string) => {
    setSelectedTraits((prev) =>
      prev.includes(trait) ? prev.filter((t) => t !== trait) : [...prev, trait]
    )
  }, [])

  /** 提交创建 */
  const handleCreate = useCallback(async () => {
    const request: SoulCreateRequest = {
      name: name.trim() || '小助手',
      emoji,
      role: 'AI助手',
      personality: {
        traits: selectedTraits,
        speakingStyle,
        emotionalTone: '温暖',
      },
      language: 'zh-CN',
      introduction: `你好！我是${name.trim() || '小助手'}，很高兴认识你～`,
    }
    await createSoul(request)
  }, [name, emoji, selectedTraits, speakingStyle, createSoul])

  /** 跳过引导，使用默认配置 */
  const handleSkip = useCallback(async () => {
    await createSoul({ name: '小助手' })
  }, [createSoul])

  /** 下一步 */
  const nextStep = useCallback((next: OnboardingStep) => {
    setStep(next)
  }, [])

  return (
    <div className="soul-onboarding">
      <div className="soul-onboarding-card">
        {/* 进度条 */}
        <div className="soul-progress">
          {(['welcome', 'name', 'emoji', 'personality', 'style', 'confirm'] as OnboardingStep[]).map(
            (s, i) => (
              <div
                key={s}
                className={`soul-progress-dot ${
                  step === s ? 'active' : i < ['welcome', 'name', 'emoji', 'personality', 'style', 'confirm'].indexOf(step) ? 'done' : ''
                }`}
              />
            )
          )}
        </div>

        {/* 步骤内容 */}
        <div className="soul-step">
          <h2 className="soul-step-title">{STEP_TITLES[step]}</h2>

          {/* Welcome */}
          {step === 'welcome' && (
            <div className="soul-step-content">
              <p className="soul-welcome-text">
                我是你的专属AI助手，但在正式认识之前，我想先了解一下你希望我是什么样子的。
              </p>
              <p className="soul-welcome-sub">只需要几步，就能定制一个属于你的助手人格 ✨</p>
              <div className="soul-actions">
                <button className="soul-btn soul-btn-primary" onClick={() => nextStep('name')}>
                  开始定制 →
                </button>
                <button className="soul-btn soul-btn-ghost" onClick={handleSkip}>
                  跳过，用默认设置
                </button>
              </div>
            </div>
          )}

          {/* Name */}
          {step === 'name' && (
            <div className="soul-step-content">
              <p className="soul-hint">给我起个名字吧，中文英文都可以～</p>
              <input
                className="soul-input"
                type="text"
                placeholder="比如：小茜、Nova、小助手..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                maxLength={20}
              />
              <div className="soul-actions">
                <button className="soul-btn soul-btn-ghost" onClick={() => nextStep('welcome')}>
                  ← 返回
                </button>
                <button
                  className="soul-btn soul-btn-primary"
                  onClick={() => nextStep('emoji')}
                  disabled={!name.trim()}
                >
                  下一步 →
                </button>
              </div>
            </div>
          )}

          {/* Emoji */}
          {step === 'emoji' && (
            <div className="soul-step-content">
              <p className="soul-hint">选一个代表我的 emoji 吧</p>
              <div className="soul-emoji-grid">
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    className={`soul-emoji-btn ${emoji === e ? 'selected' : ''}`}
                    onClick={() => setEmoji(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <div className="soul-actions">
                <button className="soul-btn soul-btn-ghost" onClick={() => nextStep('name')}>
                  ← 返回
                </button>
                <button className="soul-btn soul-btn-primary" onClick={() => nextStep('personality')}>
                  下一步 →
                </button>
              </div>
            </div>
          )}

          {/* Personality */}
          {step === 'personality' && (
            <div className="soul-step-content">
              <p className="soul-hint">选择我的性格标签（可多选）</p>
              <div className="soul-trait-grid">
                {TRAIT_OPTIONS.map((trait) => (
                  <button
                    key={trait}
                    className={`soul-trait-btn ${selectedTraits.includes(trait) ? 'selected' : ''}`}
                    onClick={() => toggleTrait(trait)}
                  >
                    {trait}
                  </button>
                ))}
              </div>
              <div className="soul-actions">
                <button className="soul-btn soul-btn-ghost" onClick={() => nextStep('emoji')}>
                  ← 返回
                </button>
                <button className="soul-btn soul-btn-primary" onClick={() => nextStep('style')}>
                  下一步 →
                </button>
              </div>
            </div>
          )}

          {/* Style */}
          {step === 'style' && (
            <div className="soul-step-content">
              <p className="soul-hint">我该怎么和你说话？</p>
              <div className="soul-style-list">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`soul-style-btn ${speakingStyle === opt.value ? 'selected' : ''}`}
                    onClick={() => setSpeakingStyle(opt.value)}
                  >
                    <span className="soul-style-label">{opt.label}</span>
                    <span className="soul-style-desc">{opt.desc}</span>
                  </button>
                ))}
              </div>
              <div className="soul-actions">
                <button className="soul-btn soul-btn-ghost" onClick={() => nextStep('personality')}>
                  ← 返回
                </button>
                <button className="soul-btn soul-btn-primary" onClick={() => nextStep('confirm')}>
                  下一步 →
                </button>
              </div>
            </div>
          )}

          {/* Confirm */}
          {step === 'confirm' && (
            <div className="soul-step-content">
              <p className="soul-hint">确认一下你的助手配置</p>
              <div className="soul-preview">
                <div className="soul-preview-avatar">{emoji}</div>
                <div className="soul-preview-info">
                  <h3>{name || '小助手'}</h3>
                  <p className="soul-preview-traits">
                    {selectedTraits.map((t) => (
                      <span key={t} className="soul-tag">{t}</span>
                    ))}
                  </p>
                  <p className="soul-preview-style">说话风格：{speakingStyle}</p>
                </div>
              </div>
              <div className="soul-actions">
                <button className="soul-btn soul-btn-ghost" onClick={() => nextStep('style')}>
                  ← 返回
                </button>
                <button className="soul-btn soul-btn-primary" onClick={handleCreate}>
                  🎉 确认创建
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SoulOnboarding
