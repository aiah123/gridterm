import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppCommand, SessionContext } from '../../shared/api'
import { computeLayout, Direction, neighbor } from './layout'
import { SessionTile } from './SessionTile'
import { ContextPanel } from './ContextPanel'
import { FilePreview } from './FilePreview'

export interface Session {
  id: number
  name: string
}

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [contexts, setContexts] = useState<Record<number, SessionContext>>({})
  const [preview, setPreview] = useState<string | null>(null)
  // Bumped to hand keyboard focus back to the active terminal.
  const [refocus, setRefocus] = useState(0)
  const counter = useRef(0)

  // Latest state for IPC callbacks registered once.
  const state = useRef({ sessions, activeId, focusedId })
  state.current = { sessions, activeId, focusedId }

  const newSession = useCallback(async () => {
    const info = await window.gridterm.createSession()
    counter.current += 1
    setSessions((s) => [...s, { id: info.id, name: `${info.shell} ${counter.current}` }])
    setActiveId(info.id)
    setFocusedId(null)
  }, [])

  const rename = useCallback((id: number, name: string) => {
    const trimmed = name.trim()
    if (trimmed) setSessions((s) => s.map((x) => (x.id === id ? { ...x, name: trimmed } : x)))
    setRenamingId(null)
  }, [])

  // Create the first session on startup (guarded against StrictMode double-run).
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void newSession()
  }, [newSession])

  useEffect(() => {
    const handleCommand = (cmd: AppCommand) => {
      const { sessions: list, activeId: active, focusedId: focused } = state.current
      const idx = list.findIndex((s) => s.id === active)
      if (cmd === 'new-session') return void newSession()
      if (active == null || idx === -1) return
      if (cmd === 'close-session') return window.gridterm.kill(active)
      if (cmd === 'rename-session') return setRenamingId(active)
      if (cmd === 'toggle-focus') return setFocusedId(focused == null ? active : null)
      let target = idx
      if (cmd.startsWith('nav-')) {
        target = neighbor(computeLayout(list.length), idx, cmd.slice(4) as Direction)
      } else if (cmd.startsWith('select-')) {
        target = Number(cmd.slice(7)) - 1
        if (target >= list.length) return
      }
      const id = list[target].id
      setActiveId(id)
      // In focus mode, navigation swaps which session is focused.
      if (focused != null) setFocusedId(id)
    }

    const offExit = window.gridterm.onExit((id) => {
      const { sessions: prev, activeId: active, focusedId: focused } = state.current
      const idx = prev.findIndex((s) => s.id === id)
      if (idx === -1) return
      const next = prev.filter((s) => s.id !== id)
      setSessions(next)
      if (focused === id) setFocusedId(null)
      setRenamingId((r) => (r === id ? null : r))
      if (next.length === 0) window.gridterm.closeWindow()
      else if (active === id) setActiveId(next[Math.min(idx, next.length - 1)].id)
    })
    const offCmd = window.gridterm.onCommand(handleCommand)
    const offCtx = window.gridterm.onContext((id, ctx) => setContexts((c) => ({ ...c, [id]: ctx })))
    return () => {
      offExit()
      offCmd()
      offCtx()
    }
  }, [newSession])

  // Closing focus mode or switching sessions closes the preview.
  useEffect(() => setPreview(null), [focusedId])

  const layout = computeLayout(sessions.length)
  const focused = sessions.find((s) => s.id === focusedId) ?? null

  return (
    <>
      <div
        className={`grid${focused ? ' has-focus' : ''}`}
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
              cwd={contexts[s.id]?.cwdDisplay ?? null}
              refocus={refocus}
              active={s.id === activeId}
              focused={s.id === focusedId}
              renaming={s.id === renamingId}
              onActivate={() => setActiveId(s.id)}
              onEnterFocus={() => {
                setActiveId(s.id)
                setFocusedId(s.id)
              }}
              onStartRename={() => {
                setActiveId(s.id)
                setRenamingId(s.id)
              }}
              onRename={(name) => rename(s.id, name)}
              onCancelRename={() => setRenamingId(null)}
              style={{ gridRow: p.row, gridColumn: `${p.colStart} / span ${p.colSpan}` }}
            />
          )
        })}
      </div>
      {focused && (
        <>
          {/* Clicking outside the focused session only exits focus mode; the
              active session stays the same and the click never reaches a tile. */}
          <div
            className="backdrop"
            data-testid="backdrop"
            onMouseDown={(e) => {
              e.preventDefault()
              setFocusedId(null)
            }}
          />
          <ContextPanel
            session={focused}
            context={contexts[focused.id]}
            onPreview={setPreview}
            onInsert={(text) => {
              setPreview(null)
              window.gridterm.write(focused.id, text)
            }}
          />
          {preview && (
            <FilePreview
              path={preview}
              onClose={() => {
                setPreview(null)
                setRefocus((n) => n + 1)
              }}
            />
          )}
        </>
      )}
    </>
  )
}
