import { useEffect } from 'react'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { MainLayout } from './components/Layout/MainLayout'
import { ToastContainer } from './components/common/Toast'
import { Live2DProvider } from './components/live2d/Live2DContext'
import { Live2DFallback } from './components/live2d/Live2DFallback'
import { SoulOnboarding } from './components/soul/SoulOnboarding'
import { useAppStore } from './stores/useAppStore'
import { useSettingsStore } from './stores/useSettingsStore'
import { useSoulStore } from './stores/useSoulStore'
import { useTheme } from './hooks/useTheme'
import './styles/soul.css'

function AppContent() {
  const setInitialized = useAppStore((s) => s.setInitialized)
  const setTheme = useAppStore((s) => s.setTheme)
  const setSettings = useSettingsStore((s) => s.setSettings)
  const setLoaded = useSettingsStore((s) => s.setLoaded)
  const { initialize: initSoul, showOnboarding } = useSoulStore()
  useTheme()

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = await window.electronAPI.invoke('config:get', { key: 'appSettings' })
        if (saved && typeof saved === 'object') {
          setSettings(saved as Record<string, unknown>)
          if ((saved as Record<string, unknown>).appearance) {
            const appearance = (saved as Record<string, unknown>).appearance as Record<string, unknown>
            if (appearance.theme) {
              setTheme(appearance.theme as 'light' | 'dark' | 'system')
            }
          }
        }
      } catch (err) {
        console.error('加载设置失败:', err)
      } finally {
        setLoaded(true)
        setInitialized(true)
      }
    }
    loadSettings()

    // 初始化 SOUL 系统（检查本地人格配置）
    initSoul()
  }, [setInitialized, setTheme, setSettings, setLoaded, initSoul])

  return (
    <>
      <Live2DProvider fallback={<Live2DFallback />}>
        <MainLayout />
      </Live2DProvider>
      <ToastContainer />
      {showOnboarding && <SoulOnboarding />}
    </>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}
