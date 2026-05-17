import React, { useEffect, useState } from 'react'

interface ToastItem { id: string; type: 'info' | 'success' | 'warning' | 'error'; message: string; duration: number }
interface ToastOptions { type?: ToastItem['type']; autoClose?: number }

let toastListeners: ((toasts: ToastItem[]) => void)[] = []
let toastList: ToastItem[] = []

export function showToast(message: string, options: ToastOptions = {}) {
  const { type = 'info', autoClose = 3000 } = options
  const id = crypto.randomUUID()
  const item: ToastItem = { id, type, message, duration: autoClose }
  toastList = [...toastList, item]
  toastListeners.forEach((fn) => fn(toastList))
  if (autoClose > 0) setTimeout(() => { toastList = toastList.filter((t) => t.id !== id); toastListeners.forEach((fn) => fn(toastList)) }, autoClose)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>(toastList)
  useEffect(() => { toastListeners.push(setToasts); return () => { toastListeners = toastListeners.filter((fn) => fn !== setToasts) } }, [])
  if (toasts.length === 0) return null
  return (
    <div className="toast-container" role="alert" aria-live="polite">
      {toasts.map((t) => (<div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>))}
    </div>
  )
}
