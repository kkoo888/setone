import { useEffect } from 'react'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { MainLayout } from './components/Layout/MainLayout'
import { ToastContainer } from './components/common/Toast'
import { SoulOnboarding } from './components/soul/SoulOnboarding'
import { useAppStore } from './stores/useAppStore'
import { useSettingsStore } from './stores/useSettingsStore'
import { useSoulStore } from './stores/useSoulStore'
import './styles/soul.css'

function AppContent() {
  const setInitialized = useAppStore((s) => s.setInitialized)
  const setSettings = useSettingsStore((s) => s.setSettings)
  const setLoaded = useSettingsStore((s) => s.setLoaded)
  const { initialize: initSoul, showOnboarding } = useSoulStore()
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = await window.electronAPI.invoke('config:get', { key: 'appSettings' })
        if (saved && typeof saved === 'object') {
          setSettings(saved as Record<string, unknown>)
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
  }, [setInitialized, setSettings, setLoaded, initSoul])

  return (
    <>
      <MainLayout />
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
