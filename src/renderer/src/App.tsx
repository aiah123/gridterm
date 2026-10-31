import { useCallback, useEffect, useRef, useState } from 'react'
import { computeLayout } from './layout'
import { SessionTile } from './SessionTile'

interface Session {
  id: number
  name: string
}

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const counter = useRef(0)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const activeRef = useRef(activeId)
  activeRef.current = activeId

  const newSession = useCallback(async () => {
    const info = await window.gridterm.createSession()
    counter.current += 1
    setSessions((s) => [...s, { id: info.id, name: `${info.shell} ${counter.current}` }])
    setActiveId(info.id)
  }, [])

  // Create the first session on startup (guarded against StrictMode double-run).
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void newSession()
  }, [newSession])

  useEffect(() => {
    const offExit = window.gridterm.onExit((id) => {
      const prev = sessionsRef.current
      const idx = prev.findIndex((s) => s.id === id)
      if (idx === -1) return
      const next = prev.filter((s) => s.id !== id)
      setSessions(next)
      if (next.length === 0) {
        window.gridterm.closeWindow()
      } else if (activeRef.current === id) {
        setActiveId(next[Math.min(idx, next.length - 1)].id)
      }
    })
    const offCmd = window.gridterm.onCommand((cmd) => {
      if (cmd === 'new-session') void newSession()
      if (cmd === 'close-session' && activeRef.current != null) window.gridterm.kill(activeRef.current)
    })
    return () => {
      offExit()
      offCmd()
    }
  }, [newSession])

  const layout = computeLayout(sessions.length)

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${layout.tracks}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${Math.max(layout.rows, 1)}, minmax(0, 1fr))`
      }}
    >
      {sessions.map((s, i) => {
        const p = layout.placements[i]
        return (
          <SessionTile
            key={s.id}
            id={s.id}
            name={s.name}
            active={s.id === activeId}
            onActivate={() => setActiveId(s.id)}
            style={{ gridRow: p.row, gridColumn: `${p.colStart} / span ${p.colSpan}` }}
          />
        )
      })}
    </div>
  )
}
