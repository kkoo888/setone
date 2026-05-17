import React, { useState, useEffect, useCallback } from 'react'

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
    <div className="cal-page">
      <div className="cal-header">
        <h1>📅 日程日历</h1>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary">＋ 新建日程</button>
      </div>
      <div className="cal-nav">
        <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="btn btn-sm">◀</button>
        <span className="cal-month">{monthName}</span>
        <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="btn btn-sm">▶</button>
      </div>
      {showAdd && (
        <div className="cal-add-form">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="日程标题" className="cal-input" />
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述" className="cal-input" />
          <input type="datetime-local" value={newStart} onChange={e => setNewStart(e.target.value)} className="cal-input" />
          <input type="datetime-local" value={newEnd} onChange={e => setNewEnd(e.target.value)} className="cal-input" />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="cal-color" />
          <div className="cal-form-actions">
            <button onClick={handleAdd} className="btn btn-primary">添加</button>
            <button onClick={() => setShowAdd(false)} className="btn">取消</button>
          </div>
        </div>
      )}
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
  )
}
