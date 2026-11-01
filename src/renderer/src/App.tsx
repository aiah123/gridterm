import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppCommand, SessionContext } from '../../shared/api'
import type { ResolvedConfig } from '../../shared/config'
import { computeLayout, Direction, neighbor } from './layout'
import { SessionTile, TileSettings } from './SessionTile'
import { ContextPanel } from './ContextPanel'
import { FilePreview } from './FilePreview'
import { Settings } from './Settings'
import { Toast, Toasts } from './Toasts'
import { terminals } from './terminals'

export interface Session {
  id: number
  name: string
}

const MIN_FONT = 6
const MAX_FONT = 72

/** Is keyboard focus in a normal text field (not a terminal)? */
function editingText(): boolean {
  const el = document.activeElement
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.classList.contains('xterm-helper-textarea')
}

export function App() {
  const [rc, setRc] = useState<ResolvedConfig | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [contexts, setContexts] = useState<Record<number, SessionContext>>({})
  const [preview, setPreview] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  /** Per-session font size change from zoom shortcuts. */
  const [zoom, setZoom] = useState<Record<number, number>>({})
  // Bumped to hand keyboard focus back to the active terminal.
  const [refocus, setRefocus] = useState(0)
  const [findingId, setFindingId] = useState<number | null>(null)
  const counter = useRef(0)

  // Latest state for IPC callbacks registered once.
  const state = useRef({ sessions, activeId, focusedId, settingsOpen, rc })
  state.current = { sessions, activeId, focusedId, settingsOpen, rc }

  const showToast = useCallback((toast: Toast) => {
    setToasts((t) => [...t.filter((x) => x.id !== toast.id), toast])
  }, [])
  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  // Config: load once, then follow changes (file edits or the settings screen).
  useEffect(() => {
    const apply = (next: ResolvedConfig) => {
      setRc(next)
      if (next.warnings.length) showToast({ id: 'config', title: 'Problems in config.toml', items: next.warnings })
      else dismissToast('config')
    }
    window.gridterm.getConfig().then(apply)
    return window.gridterm.onConfig(apply)
  }, [showToast, dismissToast])

  // Theme and spacing as CSS variables.
  useEffect(() => {
    if (!rc) return
    const root = document.documentElement.style
    root.setProperty('--term-bg', rc.themeColors.background)
    root.setProperty('--term-fg', rc.themeColors.foreground)
    root.setProperty('--accent', rc.themeColors.accent)
    root.setProperty('--gap', `${rc.config.window.gap}px`)
    root.setProperty('--pad', `${rc.config.window.padding}px`)
    // ANSI colours, used for syntax highlighting in file previews.
    for (const c of ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'brightBlack'] as const) {
      root.setProperty(`--ansi-${c}`, rc.themeColors[c])
    }
  }, [rc])

  const newSession = useCallback(async () => {
    const info = await window.gridterm.createSession()
    counter.current += 1
    setSessions((s) => [...s, { id: info.id, name: `${info.shell} ${counter.current}` }])
    setActiveId(info.id)
    setFocusedId(null)
  }, [])

  /** Reopen the sessions saved at the last quit, in order, with their names. */
  const restoreSessions = useCallback(async (): Promise<boolean> => {
    const saved = await window.gridterm.getRestore()
    if (!saved) return false
    const created: Session[] = []
    for (let i = 0; i < saved.sessions.length; i++) {
      const info = await window.gridterm.createSession({ restoreIndex: i })
      created.push({ id: info.id, name: saved.sessions[i].name })
    }
    counter.current = created.length
    setSessions(created)
    setActiveId(created[saved.activeIndex]?.id ?? created[0].id)
    return true
  }, [])

  const rename = useCallback((id: number, name: string) => {
    const trimmed = name.trim()
    if (trimmed) setSessions((s) => s.map((x) => (x.id === id ? { ...x, name: trimmed } : x)))
    setRenamingId(null)
  }, [])

  // Once the config is loaded, restore the last sessions or start a new one.
  const started = useRef(false)
  useEffect(() => {
    if (!rc || started.current) return
    started.current = true
    void restoreSessions().then((restored) => {
      if (!restored) void newSession()
    })
  }, [rc, newSession, restoreSessions])

  // Report names/order/active so the main process can save them for next time.
  useEffect(() => {
    if (started.current) window.gridterm.reportLayout(sessions, activeId)
  }, [sessions, activeId])

  useEffect(() => {
    const handleCommand = async (cmd: AppCommand) => {
      const { sessions: list, activeId: active, focusedId: focused, settingsOpen: inSettings, rc: cfg } = state.current
      // Copy/paste also serve text fields (settings, rename).
      if (cmd === 'copy') {
        if (editingText()) return void document.execCommand('copy')
        const term = active != null ? terminals.get(active) : undefined
        if (term?.hasSelection()) window.gridterm.copyText(term.getSelection())
        return
      }
      if (cmd === 'paste') {
        if (editingText()) return window.gridterm.pasteNative()
        const term = active != null ? terminals.get(active) : undefined
        const text = await window.gridterm.readClipboard()
        if (term && text) term.paste(text)
        return
      }
      if (cmd === 'open-settings') return setSettingsOpen((o) => !o)
      if (inSettings) return // other shortcuts are paused while settings are open
      if (cmd === 'new-session') return void newSession()
      const idx = list.findIndex((s) => s.id === active)
      if (active == null || idx === -1) return
      if (cmd === 'close-session') return window.gridterm.kill(active)
      if (cmd === 'rename-session') return setRenamingId(active)
      if (cmd === 'toggle-focus') return setFocusedId(focused == null ? active : null)
      if (cmd === 'find') return setFindingId(active)
      if (cmd === 'zoom-in' || cmd === 'zoom-out' || cmd === 'zoom-reset') {
        const base = cfg?.config.font.size ?? 13
        return setZoom((z) => {
          if (cmd === 'zoom-reset') return { ...z, [active]: 0 }
          const next = Math.min(MAX_FONT, Math.max(MIN_FONT, base + (z[active] ?? 0) + (cmd === 'zoom-in' ? 1 : -1)))
          return { ...z, [active]: next - base }
        })
      }
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
      setFindingId((f) => (f === id ? null : f))
      if (next.length === 0) {
        // Last shell exited: nothing to restore next time.
        window.gridterm.reportLayout([], null)
        window.gridterm.closeWindow()
      }
      else if (active === id) setActiveId(next[Math.min(idx, next.length - 1)].id)
    })
    const offCmd = window.gridterm.onCommand((cmd) => void handleCommand(cmd))
    const offCtx = window.gridterm.onContext((id, ctx) => setContexts((c) => ({ ...c, [id]: ctx })))
    return () => {
      offExit()
      offCmd()
      offCtx()
    }
  }, [newSession])

  // Closing focus mode or switching sessions closes the preview.
  useEffect(() => setPreview(null), [focusedId])
  // Give the keyboard back to the terminal when settings close.
  useEffect(() => {
    if (!settingsOpen) setRefocus((n) => n + 1)
  }, [settingsOpen])

  const baseSettings = useMemo(() => {
    if (!rc) return null
    const { config, themeColors } = rc
    return {
      fontFamily: config.font.family,
      fontSize: config.font.size,
      lineHeight: config.font.lineHeight,
      cursorStyle: config.cursor.style,
      cursorBlink: config.cursor.blink,
      scrollback: config.terminal.scrollback,
      theme: themeColors,
      optionIsMeta: config.terminal.optionIsMeta,
      copyOnSelect: config.terminal.copyOnSelect,
      bell: config.terminal.bell
    } satisfies TileSettings
  }, [rc])

  if (!rc || !baseSettings) return null

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
          const delta = zoom[s.id] ?? 0
          return (
            <SessionTile
              key={s.id}
              id={s.id}
              name={s.name}
              cwd={contexts[s.id]?.cwdDisplay ?? null}
              refocus={refocus}
              settings={delta ? { ...baseSettings, fontSize: Math.min(MAX_FONT, Math.max(MIN_FONT, baseSettings.fontSize + delta)) } : baseSettings}
              active={s.id === activeId}
              focused={s.id === focusedId}
              renaming={s.id === renamingId}
              finding={s.id === findingId}
              onCloseFind={() => {
                setFindingId(null)
                setRefocus((n) => n + 1)
              }}
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
      {settingsOpen && (
        <Settings
          rc={rc}
          onClose={() => setSettingsOpen(false)}
          onError={(message) => showToast({ id: 'settings', title: message, items: [] })}
        />
      )}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
