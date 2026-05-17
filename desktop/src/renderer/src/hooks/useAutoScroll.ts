import { useRef, useEffect, useCallback } from 'react'

/**
 * useAutoScroll — 当依赖项变化时自动滚动到容器底部
 * @param deps 触发滚动的依赖数组
 * @returns ref 回调 + 手动触发滚动的 scrollToBottom
 */
export function useAutoScroll(deps: unknown[]) {
  const endRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUp = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isUserScrolledUp.current = distanceFromBottom > 150
  }, [])

  useEffect(() => {
    if (!isUserScrolledUp.current) { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const scrollToBottom = useCallback(() => { isUserScrolledUp.current = false; endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [])

  return { endRef, containerRef, handleScroll, scrollToBottom }
}
