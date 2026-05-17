import { StrictMode, lazy, Suspense, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/global.css'

const Live2DPetPage = lazy(() => import('./pages/Live2DPetPage'))

const root = createRoot(document.getElementById('root')!)

/** 根据 hash 路由决定渲染内容，支持 hashchange 动态切换 */
function RootComponent() {
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (hash === '#/live2d-pet') {
    return (
      <Suspense fallback={null}>
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
