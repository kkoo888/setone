import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, children, className = '', ...props }: ButtonProps) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${loading ? 'btn-loading' : ''} ${className}`} disabled={disabled || loading} {...props}>
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}
