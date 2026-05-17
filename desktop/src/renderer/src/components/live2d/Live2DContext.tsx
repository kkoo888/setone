import React, { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react'
import type { Live2DState, Live2DModelConfig, ExpressionDefinition, MotionDefinition } from './types/live2d'
import { Live2DStatus, MotionPriority } from './types/live2d'
import { Live2DManager } from './Live2DManager'

type Live2DAction =
  | { type: 'SET_STATUS'; payload: Live2DStatus }
  | { type: 'SET_MODEL'; payload: Live2DModelConfig }
  | { type: 'SET_EXPRESSIONS'; payload: readonly ExpressionDefinition[] }
  | { type: 'SET_MOTIONS'; payload: readonly MotionDefinition[] }
  | { type: 'SET_CURRENT_EXPRESSION'; payload: string | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'TOGGLE_MOUSE_TRACKING' }
  | { type: 'RESET' }

const initialState: Live2DState = {
  status: Live2DStatus.IDLE,
  currentModel: null,
  expressions: [],
  motions: [],
  currentExpression: null,
  errorMessage: null,
  mouseTrackingEnabled: true,
}

function live2DReducer(state: Live2DState, action: Live2DAction): Live2DState {
  switch (action.type) {
    case 'SET_STATUS': return { ...state, status: action.payload }
    case 'SET_MODEL': return { ...state, currentModel: action.payload }
    case 'SET_EXPRESSIONS': return { ...state, expressions: action.payload }
    case 'SET_MOTIONS': return { ...state, motions: action.payload }
    case 'SET_CURRENT_EXPRESSION': return { ...state, currentExpression: action.payload }
    case 'SET_ERROR': return { ...state, errorMessage: action.payload }
    case 'TOGGLE_MOUSE_TRACKING': return { ...state, mouseTrackingEnabled: !state.mouseTrackingEnabled }
    case 'RESET': return initialState
    default: return state
  }
}

interface Live2DContextValue {
  state: Live2DState
  loadModel: (config: Live2DModelConfig) => Promise<void>
  setExpression: (expressionId: string) => Promise<void>
  playMotion: (motionId: string) => Promise<void>
  toggleMouseTracking: () => void
  reset: () => void
}

const Live2DContext = createContext<Live2DContextValue | null>(null)

export function Live2DProvider({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [state, dispatch] = useReducer(live2DReducer, initialState)
  const managerRef = React.useRef<Live2DManager>(Live2DManager.getInstance())

  useEffect(() => {
    const manager = managerRef.current
    manager.setStatusChangeCallback((status) => dispatch({ type: 'SET_STATUS', payload: status }))
    return () => { manager.destroy() }
  }, [])

  const loadModel = useCallback(async (config: Live2DModelConfig) => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null })
      await managerRef.current.loadModel(config)
      dispatch({ type: 'SET_MODEL', payload: config })
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : '加载失败' })
      dispatch({ type: 'SET_STATUS', payload: Live2DStatus.ERROR })
    }
  }, [])

  const setExpression = useCallback(async (id: string) => {
    await managerRef.current.setExpression(id)
    dispatch({ type: 'SET_CURRENT_EXPRESSION', payload: id })
  }, [])

  const playMotion = useCallback(async (id: string) => { await managerRef.current.playMotion(id) }, [])

  const toggleMouseTracking = useCallback(() => {
    managerRef.current.setMouseTracking(!state.mouseTrackingEnabled)
    dispatch({ type: 'TOGGLE_MOUSE_TRACKING' })
  }, [state.mouseTrackingEnabled])

  const reset = useCallback(() => { managerRef.current.destroy(); dispatch({ type: 'RESET' }) }, [])

  if (state.status === Live2DStatus.ERROR && fallback) return <>{fallback}</>

  return (
    <Live2DContext.Provider value={{ state, loadModel, setExpression, playMotion, toggleMouseTracking, reset }}>
      {children}
    </Live2DContext.Provider>
  )
}

export function useLive2DContext(): Live2DContextValue {
  const ctx = useContext(Live2DContext)
  if (!ctx) throw new Error('useLive2DContext 必须在 Live2DProvider 内使用')
  return ctx
}
