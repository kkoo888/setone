import React, { useState, useEffect, useCallback } from 'react'
import { ModuleHeader } from '../../components/common/module/ModuleHeader'

interface Event { id: string; title: string; description: string; startTime: number; endTime: number; color: string; allDay: boolean; reminder: number }

export function CalendarPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newColor, setNewColor] = useState('#4a9eff')

  const loadEvents = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke('calendar_list', { month: currentDate.getMonth(), year: currentDate.getFullYear() })
      if (res?.success) setEvents(res.data ?? [])
    } catch { /* ignore */ }
  }, [currentDate])

  useEffect(() => { loadEvents() }, [loadEvents])

  const handleAdd = async () => {
    if (!newTitle.trim() || !newStart) return
    try {
      await window.electronAPI.invoke('calendar_create', {
        title: newTitle, description: newDesc, startTime: new Date(newStart).getTime(),
        endTime: newEnd ? new Date(newEnd).getTime() : new Date(newStart).getTime() + 3600000, color: newColor, allDay: false, reminder: 15
      })
      setShowAdd(false); setNewTitle(''); setNewStart(''); setNewEnd(''); setNewDesc(''); loadEvents()
    } catch { /* ignore */ }
  }

  const handleDelete = async (id: string) => {
    try { await window.electronAPI.invoke('calendar_delete', { id }); loadEvents() } catch { /* ignore */ }
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const blanks = Array.from({ length: firstDay }, (_, i) => i)
  const monthName = `${year}年${month + 1}月`

  const getEventsForDay = (day: number) => {
    const dayStart = new Date(year, month, day).getTime()
    const dayEnd = dayStart + 86400000
    return events.filter(e => e.startTime < dayEnd && e.endTime > dayStart)
  }

  return (
    <div className="mod-page">
      <ModuleHeader
        icon="📅"
        title="日程日历"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="btn btn-sm">◀</button>
            <span style={{ fontSize: 14, fontWeight: 600, minWidth: 100, textAlign: 'center' }}>{monthName}</span>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="btn btn-sm">▶</button>
            <button onClick={() => setShowAdd(true)} className="btn btn-primary">＋ 新建日程</button>
          </div>
        }
      />

      {showAdd && (
        <div style={{ padding: '12px 24px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', animation: 'scSlideDown 0.2s ease' }}>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="日程标题" className="mod-search" />
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述" className="mod-search" />
          <input type="datetime-local" value={newStart} onChange={e => setNewStart(e.target.value)} style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13 }} />
          <input type="datetime-local" value={newEnd} onChange={e => setNewEnd(e.target.value)} style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13 }} />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ width: 36, height: 36, border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
          <button onClick={handleAdd} className="btn btn-primary">添加</button>
          <button onClick={() => setShowAdd(false)} className="btn">取消</button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px' }}>
        <div className="cal-grid">
          {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} className="cal-weekday">{d}</div>)}
          {blanks.map(b => <div key={`b${b}`} className="cal-blank" />)}
          {days.map(day => {
            const dayEvents = getEventsForDay(day)
            const isToday = new Date().toDateString() === new Date(year, month, day).toDateString()
            return (
              <div key={day} className={`cal-day ${isToday ? 'cal-today' : ''}`}>
                <span className="cal-day-num">{day}</span>
                {dayEvents.slice(0, 3).map(e => (
                  <div key={e.id} className="cal-event" style={{ backgroundColor: e.color }}>
                    <span className="cal-event-title">{e.title}</span>
                    <button onClick={() => handleDelete(e.id)} className="cal-event-del">×</button>
                  </div>
                ))}
                {dayEvents.length > 3 && <div className="cal-more">+{dayEvents.length - 3} 更多</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
