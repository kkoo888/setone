import { useCallback, useEffect, useRef } from 'react'

export function useIpcInvoke() {
  return useCallback(async <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
    return window.electronAPI.invoke(channel, ...args)
  }, [])
}

export function useIpcOn(channel: string, callback: (...args: unknown[]) => void) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  useEffect(() => {
    const unsubscribe = window.electronAPI.on(channel, (...args: unknown[]) => { callbackRef.current(...args) })
    return () => { unsubscribe() }
  }, [channel])
}
