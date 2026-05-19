import React, { Suspense, lazy, Component, useEffect, type ReactNode, type ErrorInfo } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { StatusBar } from '../common/StatusBar'
import { ChangesPanel } from '../changes/ChangesPanel'
import { CommandPalette } from '../command-palette/CommandPalette'
import { useAppStore } from '../../stores/useAppStore'
import { useCommandPaletteStore } from '../../stores/useCommandPaletteStore'

const ChatPage = lazy(() => import('../../pages/ChatPage').then(m => ({ default: m.ChatPage })))
const SkillsPage = lazy(() => import('../../pages/SkillsPage').then(m => ({ default: m.SkillsPage })))
const SettingsPage = lazy(() => import('../../pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const ModulesPage = lazy(() => import('../../pages/ModulesPage').then(m => ({ default: m.ModulesPage })))
const Live2DPage = lazy(() => import('../../pages/Live2DPage').then(m => ({ default: m.Live2DPage })))
const Live2D5Page = lazy(() => import('../../pages/Live2D5Page').then(m => ({ default: m.Live2D5Page })))
const KnowledgeBasePage = lazy(() => import('../../pages/KnowledgeBasePage').then(m => ({ default: m.KnowledgeBasePage })))
const TranslatorPage = lazy(() => import('../../pages/TranslatorPage').then(m => ({ default: m.TranslatorPage })))
const WorkflowPage = lazy(() => import('../../pages/WorkflowPage').then(m => ({ default: m.WorkflowPage })))
const ShortcutsPage = lazy(() => import('../../pages/ShortcutsPage').then(m => ({ default: m.ShortcutsPage })))
const ClipboardHistoryPage = lazy(() => import('../../pages/ClipboardHistoryPage').then(m => ({ default: m.ClipboardHistoryPage })))
const NotificationsPage = lazy(() => import('../../pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })))
const MultiSessionPage = lazy(() => import('../../pages/MultiSessionPage').then(m => ({ default: m.MultiSessionPage })))
const CalendarPage = lazy(() => import('../../pages/CalendarPage').then(m => ({ default: m.CalendarPage })))
const QuickPreviewPage = lazy(() => import('../../pages/QuickPreviewPage').then(m => ({ default: m.QuickPreviewPage })))
const SystemDashboardPage = lazy(() => import('../../pages/SystemDashboardPage').then(m => ({ default: m.SystemDashboardPage })))
const ThemeStorePage = lazy(() => import('../../pages/ThemeStorePage').then(m => ({ default: m.ThemeStorePage })))
const CodeSnippetsPage = lazy(() => import('../../pages/CodeSnippetsPage').then(m => ({ default: m.CodeSnippetsPage })))

function PageLoading() {
  return (<div className="page-loading" role="status" aria-label="页面加载中"><div className="page-loading-spinner" /><span className="page-loading-text">加载中…</span></div>)
}

interface LazyErrorBoundaryState { hasError: boolean; error: Error | null }
class LazyLoadErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, LazyErrorBoundaryState> {
  state: LazyErrorBoundaryState = { hasError: false, error: null }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[LazyLoadErrorBoundary]', error, info) }
  handleRetry = () => { this.setState({ hasError: false, error: null }) }
  render() {
    if (this.state.hasError) return (this.props.fallback ?? (<div className="page-error" role="alert"><p>页面加载失败，请检查网络后重试</p><button className="btn btn-primary" onClick={this.handleRetry}>重试</button></div>))
    return this.props.children
  }
}

/** 模块专属页面占位组件 */
function ModulePlaceholderPage({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div className="module-placeholder-page">
      <div className="module-placeholder-content">
        <span className="module-placeholder-icon">{icon}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  )
}

/** 模块面板ID → 占位页面配置 */
const MODULE_PAGE_CONFIG: Record<string, { title: string; description: string; icon: string }> = {
  'workflow': { title: '工作流自动化', description: '可视化工作流编排，触发器 + 多步骤自动化执行', icon: '🔄' },
  'knowledge-base': { title: '本地知识库', description: '文件导入、向量化、语义检索，本地 RAG 问答', icon: '📚' },
  'translator': { title: '翻译面板', description: '划词翻译、全文翻译、翻译历史与收藏', icon: '🌐' },
  'memory': { title: '记忆系统', description: '短期/长期记忆管理，语义搜索与 AI 摘要', icon: '🧠' },
  'task': { title: '任务规划', description: '复杂任务拆解为多步执行，状态追踪与进度管理', icon: '📋' },
  'vision': { title: '视觉感知', description: '视频流捕获、帧变化检测、AI 画面分析', icon: '👁️' },
  'screen': { title: '屏幕理解', description: '截图捕获、OCR 文字识别、屏幕区域选择', icon: '🖥️' },
  'proactive': { title: '主动关怀', description: '定时提醒、天气查询、主动问候', icon: '💝' },
}

/** 所有可能被主题覆盖的 CSS 变量列表 */
const THEME_CSS_VARS = [
  '--color-accent', '--color-accent-hover', '--color-accent-light',
  '--color-bg-primary', '--color-bg-secondary', '--color-bg-tertiary',
  '--color-text-primary', '--color-text-secondary', '--color-text-tertiary',
  '--color-border', '--color-shadow',
  '--color-success', '--color-warning', '--color-error', '--color-info',
  '--color-accent-text', '--color-accent-text-hover',
]

/**
 * 根据背景色自动选择对比度更高的前景色（深色 or 白色）
 * 选择 dark/light 中对比度更高的那个
 */
function autoTextColor(bgHex: string): string {
  const r = parseInt(bgHex.slice(1, 3), 16) / 255
  const g = parseInt(bgHex.slice(3, 5), 16) / 255
  const b = parseInt(bgHex.slice(5, 7), 16) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // 计算深色和白色分别与背景的对比度，选更高的
  const darkLum = 0.1 // #1a1a1a 近似亮度
  const lightLum = 1.0 // #ffffff
  const contrastDark = (lum + 0.05) / (darkLum + 0.05)
  const contrastLight = (lightLum + 0.05) / (lum + 0.05)
  return contrastDark >= contrastLight ? '#1a1a1a' : '#ffffff'
}

/** 将主题应用到 DOM：设置 data-theme + CSS 变量覆盖 */
function applyThemeToDOM(mode?: string, colors?: Record<string, string>) {
  const root = document.documentElement
  // 1. 先清除上一个主题的所有 inline style 覆盖，避免残留
  for (const cssVar of THEME_CSS_VARS) {
    root.style.removeProperty(cssVar)
  }
  // 2. 设置明暗模式（让 variables.css 的 [data-theme] 选择器生效）
  if (mode === 'light' || mode === 'dark') {
    root.setAttribute('data-theme', mode)
  } else if (mode === 'system') {
    root.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  }
  // 3. 应用配色变量覆盖（仅对有值的变量设置 inline style）
  if (colors) {
    const mapping: Record<string, string> = {
      accent: '--color-accent',
      'accent-hover': '--color-accent-hover',
      'accent-light': '--color-accent-light',
      'bg-primary': '--color-bg-primary',
      'bg-secondary': '--color-bg-secondary',
      'bg-tertiary': '--color-bg-tertiary',
      'text-primary': '--color-text-primary',
      'text-secondary': '--color-text-secondary',
      'text-tertiary': '--color-text-tertiary',
      border: '--color-border',
      shadow: '--color-shadow',
      success: '--color-success',
      warning: '--color-warning',
      error: '--color-error',
      info: '--color-info',
    }
    for (const [key, cssVar] of Object.entries(mapping)) {
      if (colors[key]) root.style.setProperty(cssVar, colors[key])
    }
    // 4. 自动计算强调色按钮上的文字颜色（确保可读性）
    const accentColor = colors.accent
    if (accentColor && accentColor.startsWith('#')) {
      root.style.setProperty('--color-accent-text', autoTextColor(accentColor))
    }
    const hoverColor = colors['accent-hover']
    if (hoverColor && hoverColor.startsWith('#')) {
      root.style.setProperty('--color-accent-text-hover', autoTextColor(hoverColor))
    }
  }
  // 5. 持久化
  try { localStorage.setItem('active-theme-id', colors ? 'custom' : (mode ?? 'light')) } catch { /* ignore */ }
}

export function MainLayout() {
  const activePanel = useAppStore((s) => s.activePanel)
  const showChangesPanel = useAppStore((s) => s.showChangesPanel)
  const setActivePanel = useAppStore((s) => s.setActivePanel)

  // 监听命令面板的导航事件
  useEffect(() => {
    const unsub = window.electronAPI.on('navigate', (data: { page: string }) => {
      if (data?.page) {
        setActivePanel(data.page as 'chat' | 'skills' | 'settings' | 'modules' | 'live2d')
      }
    })
    return unsub
  }, [setActivePanel])

  // 监听全局快捷键触发
  useEffect(() => {
    const unsub = window.electronAPI.on('hotkey:triggered', (data: { accelerator: string }) => {
      const { accelerator } = data
      if (accelerator === 'CommandOrControl+K') {
        // 直接打开命令面板
        useCommandPaletteStore.getState().open()
      } else if (accelerator === 'CommandOrControl+Shift+A') {
        // 切换窗口显示/隐藏
        window.electronAPI.invoke('window:toggle', {})
      }
    })
    return unsub
  }, [])

  // 监听主题变更事件，应用明暗模式 + 配色
  useEffect(() => {
    const unsub = window.electronAPI.on('theme:changed', (data: { themeId: string; mode?: string; colors?: Record<string, string> }) => {
      applyThemeToDOM(data.mode, data.colors)
    })
    return unsub
  }, [])

  // 启动时加载已保存的主题
  useEffect(() => {
    const loadSavedTheme = async () => {
      try {
        const themeId = await window.electronAPI.invoke('config:get', { key: 'activeTheme' })
        if (themeId && typeof themeId === 'string') {
          const res = await window.electronAPI.invoke('theme_list')
          if (res?.success) {
            const theme = (res.data as Array<{ id: string; mode?: string; colors: Record<string, string> }>).find((t) => t.id === themeId)
            if (theme) {
              applyThemeToDOM(theme.mode, theme.colors)
            }
          }
        }
      } catch { /* ignore */ }
    }
    loadSavedTheme()
  }, [])

  const isChat = activePanel === 'chat'

  const renderPage = () => {
    switch (activePanel) {
      case 'skills': return <SkillsPage />
      case 'settings': return <SettingsPage />
      case 'modules': return <ModulesPage />
      case 'live2d': return <Live2DPage />
      case 'live2d5': return <Live2D5Page />
      case 'knowledge-base': return <KnowledgeBasePage />
      case 'translator': return <TranslatorPage />
      case 'workflow': return <WorkflowPage />
      case 'shortcuts': return <ShortcutsPage />
      case 'clipboard-history': return <ClipboardHistoryPage />
      case 'notifications': return <NotificationsPage />
      case 'multi-session': return <MultiSessionPage />
      case 'calendar': return <CalendarPage />
      case 'quick-preview': return <QuickPreviewPage />
      case 'system-dashboard': return <SystemDashboardPage />
      case 'theme-store': return <ThemeStorePage />
      case 'code-snippets': return <CodeSnippetsPage />
      case 'chat': return <ChatPage />
      default: {
        // 模块专属页面（记忆、任务、视觉、屏幕、主动关怀）
        const config = activePanel ? MODULE_PAGE_CONFIG[activePanel] : null
        if (config) {
          return <ModulePlaceholderPage {...config} />
        }
        return <ChatPage />
      }
    }
  }
  return (
    <div className="main-layout">
      <Sidebar />
      <div className="main-content">
        <Header />
        <div className="main-body">
          <main className={`page-container${isChat ? ' page-container--chat' : ''}`} aria-label="主内容区">
            <LazyLoadErrorBoundary><Suspense fallback={<PageLoading />}>{renderPage()}</Suspense></LazyLoadErrorBoundary>
          </main>
          {showChangesPanel && activePanel === 'chat' && <ChangesPanel />}
        </div>
        <StatusBar />
      </div>
      <CommandPalette />
    </div>
  )
}
