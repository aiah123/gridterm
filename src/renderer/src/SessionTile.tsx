import { CSSProperties, useEffect, useRef, useState } from 'react'
import { ITheme, Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import type { BellMode, CursorStyle } from '../../shared/config'
import { unescapePayload } from './osc'
import { terminals } from './terminals'
import { beep } from './bell'

/** Terminal settings that can change while the terminal is running. */
export interface TileSettings {
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorStyle: CursorStyle
  cursorBlink: boolean
  scrollback: number
  theme: ITheme
  optionIsMeta: boolean
  copyOnSelect: boolean
  bell: BellMode
}

interface Props {
  id: number
  name: string
  cwd: string | null
  refocus: number
  settings: TileSettings
  active: boolean
  focused: boolean
  renaming: boolean
  onActivate(): void
  onEnterFocus(): void
  onStartRename(): void
  onRename(name: string): void
  onCancelRename(): void
  style: CSSProperties
}

export function SessionTile(props: Props) {
  const { id, name, cwd, active, focused, renaming, style, settings } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<(() => void) | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const activeRef = useRef(active)
  activeRef.current = active
  const [bellFlash, setBellFlash] = useState(false)
  const [bellPending, setBellPending] = useState(false)

  // Create the terminal once per session; it survives layout changes.
  useEffect(() => {
    const host = hostRef.current!
    const s = settingsRef.current
    const term = new Terminal({
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      cursorStyle: s.cursorStyle,
      cursorBlink: s.cursorBlink,
      scrollback: s.scrollback,
      theme: s.theme,
      macOptionIsMeta: s.optionIsMeta,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      // Fall back to the default DOM renderer.
    }
    termRef.current = term
    terminals.set(id, term)

    // Shell integration events: ESC ] 7770 ; kind ; payload BEL
    const osc = term.parser.registerOscHandler(7770, (data) => {
      const sep = data.indexOf(';')
      if (sep === -1) return true
      window.gridterm.contextEvent(id, data.slice(0, sep), unescapePayload(data.slice(sep + 1)))
      return true
    })

    const offData = window.gridterm.onData(id, (d) => term.write(d))
    const input = term.onData((d) => window.gridterm.write(id, d))
    const selection = term.onSelectionChange(() => {
      if (settingsRef.current.copyOnSelect && term.hasSelection()) window.gridterm.copyText(term.getSelection())
    })
    let bellTimer: ReturnType<typeof setTimeout> | undefined
    const bell = term.onBell(() => {
      const mode = settingsRef.current.bell
      if (mode === 'none') return
      if (mode === 'sound') beep()
      setBellFlash(true)
      clearTimeout(bellTimer)
      bellTimer = setTimeout(() => setBellFlash(false), 280)
      if (!activeRef.current) setBellPending(true)
    })

    // Keep PTY size in sync with the tile (debounced during drags/animations).
    let timer: ReturnType<typeof setTimeout> | undefined
    const doFit = () => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return
      fit.fit()
      window.gridterm.resize(id, term.cols, term.rows)
    }
    fitRef.current = doFit
    doFit()
    const ro = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(doFit, 30)
    })
    ro.observe(host)

    return () => {
      clearTimeout(timer)
      clearTimeout(bellTimer)
      ro.disconnect()
      input.dispose()
      selection.dispose()
      bell.dispose()
      osc.dispose()
      offData()
      terminals.delete(id)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [id])

  // Apply setting changes live.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const o = term.options
    o.fontFamily = settings.fontFamily
    o.fontSize = settings.fontSize
    o.lineHeight = settings.lineHeight
    o.cursorStyle = settings.cursorStyle
    o.cursorBlink = settings.cursorBlink
    o.scrollback = settings.scrollback
    o.theme = settings.theme
    o.macOptionIsMeta = settings.optionIsMeta
    fitRef.current?.()
  }, [settings.fontFamily, settings.fontSize, settings.lineHeight, settings.cursorStyle, settings.cursorBlink, settings.scrollback, settings.theme, settings.optionIsMeta])

  // Only the active tile receives keyboard input. Re-run when focus mode or
  // renaming changes, since those move keyboard focus away from the terminal.
  useEffect(() => {
    if (active) setBellPending(false)
    if (active && !renaming) termRef.current?.focus()
    else termRef.current?.blur()
  }, [active, focused, renaming, props.refocus])

  return (
    <div
      className={`tile${active ? ' active' : ''}${focused ? ' focused' : ''}${bellFlash ? ' bell-flash' : ''}`}
      style={style}
      data-session-id={id}
      data-font-size={settings.fontSize}
      onMouseDown={props.onActivate}
    >
      <div className="title" onDoubleClick={props.onStartRename} title="Double-click to rename">
        {renaming ? (
          <RenameInput initial={name} onDone={props.onRename} onCancel={props.onCancelRename} />
        ) : (
          <>
            {bellPending && <span className="bell-dot" title="Bell" data-testid="bell-dot" />}
            <span className="title-text">
              {name}
              {cwd && <span className="cwd"> — {cwd}</span>}
            </span>
          </>
        )}
      </div>
      <div
        className="term"
        ref={hostRef}
        onDoubleClick={() => {
          if (!focused) props.onEnterFocus()
        }}
      />
    </div>
  )
}

function RenameInput(props: { initial: string; onDone(name: string): void; onCancel(): void }) {
  const [value, setValue] = useState(props.initial)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    if (save) props.onDone(value)
    else props.onCancel()
  }
  return (
    <input
      ref={ref}
      className="rename"
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      onBlur={() => finish(true)}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  )
}
