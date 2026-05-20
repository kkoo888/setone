import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { Help } from '../../utils/statusMessages'

interface ErrorBoundaryProps { children: ReactNode; fallback?: ReactNode }
interface ErrorBoundaryState { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error } }
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void { console.error('[ErrorBoundary]', error, errorInfo); window.electronAPI?.send('error:report', { message: error.message, stack: error.stack, componentStack: errorInfo.componentStack }) }
  handleReset = (): void => { this.setState({ hasError: false, error: null }) }
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-icon">{React.createElement(Help, { size: 32, fill: '#f59e0b', theme: 'outline' })}</div>
          <h2 className="error-boundary-title">应用遇到了错误</h2>
          <p className="error-boundary-message">{this.state.error?.message ?? '未知错误'}</p>
          <div className="error-boundary-actions">
            <button className="btn btn-primary" onClick={this.handleReset}>重试</button>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>刷新页面</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
