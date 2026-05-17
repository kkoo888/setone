import { useEffect, useRef, useCallback } from 'react'
import { Live2DManager } from '../Live2DManager'

export function useMouseTracking(containerRef: React.RefObject<HTMLElement | null>, options: { enabled: boolean; throttleMs?: number }) {
  const { enabled, throttleMs = 16 } = options
  const lastUpdateTime = useRef<number>(0)
  const managerRef = useRef<Live2DManager>(Live2DManager.getInstance())

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!enabled) return
    const now = Date.now()
    if (now - lastUpdateTime.current < throttleMs) return
    lastUpdateTime.current = now
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    managerRef.current.updateMousePosition(event.clientX - rect.left, event.clientY - rect.top)
  }, [enabled, throttleMs, containerRef])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return
    container.addEventListener('mousemove', handleMouseMove)
    return () => container.removeEventListener('mousemove', handleMouseMove)
  }, [enabled, handleMouseMove, containerRef])
}
