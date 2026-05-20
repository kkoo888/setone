import { StrictMode, lazy, Suspense, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/global.css'
import './styles/module-common.css'

const Live2DPetPage = lazy(() => import('./pages/Live2DPetPage'))
const Live2D5PetPage = lazy(() => import('./pages/Live2D5PetPage'))

const root = createRoot(document.getElementById('root')!)

console.log('[Main] 🚀 应用启动, hash:', window.location.hash, 'href:', window.location.href)
console.log('[Main] 🚀 electronAPI 可用:', !!window.electronAPI)
console.log('[Main] 🚀 userAgent:', navigator.userAgent)

// 全局错误捕获（方便调试）
window.addEventListener('error', (e) => {
  console.error('[Main] 💥 全局错误:', e.message, 'at', e.filename, ':', e.lineno, ':', e.colno, 'error:', e.error)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Main] 💥 未处理的 Promise rejection:', e.reason)
})

/** 根据 hash 路由决定渲染内容，支持 hashchange 动态切换 */
function RootComponent() {
  const [hash, setHash] = useState(window.location.hash)

  console.log('[Main] RootComponent 渲染, hash:', hash)

  useEffect(() => {
    const handleHashChange = () => {
      const newHash = window.location.hash
      console.log('[Main] hashchange 事件, 新 hash:', newHash)
      setHash(newHash)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (hash === '#/live2d5-pet' || hash.startsWith('#/live2d5-pet')) {
    console.log('[Main] 🎭 匹配到 live2d5-pet 路由, 加载 Cubism 5 宠物页面')
    return (
      <Suspense fallback={<div style={{color:'#fff',padding:20}}>加载 Cubism 5...</div>}>
        <Live2D5PetPage />
      </Suspense>
    )
  }

  if (hash === '#/live2d-pet' || hash.startsWith('#/live2d-pet')) {
    console.log('[Main] 🐱 匹配到 live2d-pet 路由, 加载宠物页面')
    return (
      <Suspense fallback={<div style={{color:'#fff',padding:20}}>加载中...</div>}>
        <Live2DPetPage />
      </Suspense>
    )
  }

  return (
    <StrictMode>
      <App />
    </StrictMode>
  )
}

root.render(<RootComponent />)
