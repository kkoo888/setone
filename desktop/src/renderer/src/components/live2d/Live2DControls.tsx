import React, { useState, useMemo } from 'react'
import { useLive2DContext } from './Live2DContext'
import { Live2DStatus } from './types/live2d'

export const Live2DControls: React.FC = () => {
  const { state, setExpression, playMotion, toggleMouseTracking } = useLive2DContext()
  const [selectedGroup, setSelectedGroup] = useState('')

  const motionGroups = useMemo(() => {
    const groups = new Map<string, typeof state.motions>()
    for (const m of state.motions) { const e = groups.get(m.group) ?? []; groups.set(m.group, [...e, m]) }
    return groups
  }, [state.motions])

  if (state.status !== Live2DStatus.LOADED) return null

  return (
    <div className="live2d-controls">
      <section className="control-section">
        <h3>表情</h3>
        <div className="expression-grid">
          {state.expressions.map((e) => (<button key={e.id} className={`expression-btn ${state.currentExpression === e.id ? 'active' : ''}`} onClick={() => void setExpression(e.id)}>{e.name}</button>))}
        </div>
      </section>
      <section className="control-section">
        <h3>动作</h3>
        <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
          <option value="">选择动作组</option>
          {Array.from(motionGroups.keys()).map((g) => (<option key={g} value={g}>{g}</option>))}
        </select>
        {selectedGroup && <div className="motion-grid">{(motionGroups.get(selectedGroup) ?? []).map((m) => (<button key={m.id} className="motion-btn" onClick={() => void playMotion(m.id)}>{m.name}</button>))}</div>}
      </section>
      <section className="control-section">
        <label className="toggle-label"><input type="checkbox" checked={state.mouseTrackingEnabled} onChange={toggleMouseTracking} /><span>鼠标跟随</span></label>
      </section>
      <div className="status-bar"><span className={`status-dot ${state.status}`} /><span className="status-text">{state.status === Live2DStatus.LOADED ? '模型就绪' : state.status === Live2DStatus.LOADING ? '加载中...' : state.status === Live2DStatus.ERROR ? '加载失败' : '待机'}</span></div>
    </div>
  )
}

export default Live2DControls
