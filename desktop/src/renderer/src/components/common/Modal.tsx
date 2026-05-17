import React, { useEffect, useRef } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => { const d = dialogRef.current; if (!d) return; if (open && !d.open) d.showModal(); else if (!open && d.open) d.close() }, [open])
  useEffect(() => { const d = dialogRef.current; if (!d) return; const h = () => onClose(); d.addEventListener('close', h); return () => d.removeEventListener('close', h) }, [onClose])
  return (
    <dialog ref={dialogRef} className="modal" aria-modal="true">
      {title && (<div className="modal-header"><h2 className="modal-title">{title}</h2><button className="modal-close" onClick={onClose} aria-label="关闭">✕</button></div>)}
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </dialog>
  )
}
