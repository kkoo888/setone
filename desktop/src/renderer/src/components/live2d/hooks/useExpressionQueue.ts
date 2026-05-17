import { useState, useCallback, useRef, useEffect } from 'react'

interface QueuedExpression { id: string; durationMs: number }

export function useExpressionQueue(setExpression: (id: string) => Promise<void>) {
  const [queue, setQueue] = useState<QueuedExpression[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const processQueue = useCallback(async () => {
    if (queue.length === 0 || isPlaying) return
    setIsPlaying(true)
    const next = queue[0]
    try {
      await setExpression(next.id)
      if (next.durationMs > 0) await new Promise<void>((r) => { timerRef.current = setTimeout(r, next.durationMs) })
    } finally { setQueue((p) => p.slice(1)); setIsPlaying(false) }
  }, [queue, isPlaying, setExpression])

  useEffect(() => { processQueue(); return () => { if (timerRef.current) clearTimeout(timerRef.current) } }, [processQueue])

  const enqueue = useCallback((id: string, durationMs = 3000) => { setQueue((p) => [...p, { id, durationMs }]) }, [])
  const clear = useCallback(() => { setQueue([]); if (timerRef.current) clearTimeout(timerRef.current); setIsPlaying(false) }, [])

  return { enqueue, clear, queueLength: queue.length, isPlaying }
}
