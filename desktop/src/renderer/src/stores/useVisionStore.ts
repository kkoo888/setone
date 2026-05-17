import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { useChatStore } from './useChatStore'

export interface CaptureRegion { x: number; y: number; width: number; height: number }

export interface VisionAnalysis {
  id: string
  timestamp: number
  imageUrl: string
  description: string
  objects: string[]
  text: string
  region?: CaptureRegion
}

interface VisionState {
  isEnabled: boolean
  mode: 'continuous' | 'manual'
  lastCapture: VisionAnalysis | null
  fps: number
  isCapturing: boolean
  setEnabled: (value: boolean) => void
  setMode: (mode: 'continuous' | 'manual') => void
  updateLastCapture: (capture: VisionAnalysis | null) => void
  setFps: (fps: number) => void
  setCapturing: (value: boolean) => void
}

export const useVisionStore = create<VisionState>()(
  subscribeWithSelector((set, get) => ({
    isEnabled: false,
    mode: 'manual',
    lastCapture: null,
    fps: 1,
    isCapturing: false,
    setEnabled: (value) => {
      set({ isEnabled: value })
      if (!value && get().isCapturing) set({ isCapturing: false })
    },
    setMode: (mode) => set({ mode }),
    updateLastCapture: (capture) => {
      set({ lastCapture: capture })
      if (capture) {
        const { addMessage } = useChatStore.getState()
        addMessage({ role: 'system', content: `[视觉] ${capture.description}` })
      }
    },
    setFps: (fps) => {
      const clamped = Math.max(0.5, Math.min(fps, 30))
      set({ fps: clamped })
      window.electron?.ipcRenderer?.send('on_vision_fps_change', { fps: clamped })
    },
    setCapturing: (value) => {
      if (value && !get().isEnabled) return
      set({ isCapturing: value })
    }
  }))
)

if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
  window.electron.ipcRenderer.on('on_vision_toggle', (_event: unknown, data: { enabled: boolean; mode?: string }) => {
    const store = useVisionStore.getState()
    store.setEnabled(data.enabled)
    if (data.mode) store.setMode(data.mode === 'continuous' ? 'continuous' : 'manual')
  })
  window.electron.ipcRenderer.on('on_vision_started', (_event: unknown, data: { mode: string; fps?: number }) => {
    const store = useVisionStore.getState()
    store.setEnabled(true)
    store.setCapturing(true)
    if (data.mode === 'continuous') store.setMode('continuous')
    if (data.fps) store.setFps(data.fps)
  })
  window.electron.ipcRenderer.on('on_vision_stopped', () => {
    const store = useVisionStore.getState()
    store.setCapturing(false)
    store.setEnabled(false)
    store.setMode('manual')
  })
}

let _ipcInitialized = false
export function initVisionIpcListeners(): void {
  if (_ipcInitialized) return
  _ipcInitialized = true
}
