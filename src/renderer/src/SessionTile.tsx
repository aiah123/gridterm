import { CSSProperties, useEffect, useRef, useState } from 'react'
import { ITheme, Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { BellMode, CursorStyle } from '../../shared/config'
import { parseIntegrationMessage } from './osc'
import { terminals } from './terminals'
import { beep } from './bell'
import { FindBar } from './FindBar'

/**
 * Browsers allow only ~16 live WebGL contexts. Past this many terminals, new
 * ones use the DOM renderer instead of risking lost contexts.
 */
const MAX_WEBGL = 12
let webglInUse = 0

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
  finding: boolean
  onCloseFind(): void
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
  const searchRef = useRef<SearchAddon | null>(null)
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
    const search = new SearchAddon()
    term.loadAddon(search)
    searchRef.current = search
    // Links open with Cmd+click (macOS) or Ctrl+click, so plain clicks still select text.
    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        if (window.gridterm.platform === 'darwin' ? event.metaKey : event.ctrlKey) window.gridterm.openLink(uri)
      })
    )
    term.open(host)
    let webgl: WebglAddon | null = null
    if (webglInUse < MAX_WEBGL) {
      try {
        webgl = new WebglAddon()
        webgl.onContextLoss(() => {
          webgl?.dispose()
          webgl = null
          webglInUse--
        })
        term.loadAddon(webgl)
        webglInUse++
      } catch {
        webgl = null // Fall back to the default DOM renderer.
      }
    }
    termRef.current = term
    terminals.set(id, term)

    // Shell integration events: ESC ] 7770 ; kind ; payload BEL
    // Always swallowed; forwarded only if well-formed. The main process drops
    // any message whose nonce doesn't match (i.e. forged by program output).
    const osc = term.parser.registerOscHandler(7770, (data) => {
      const msg = parseIntegrationMessage(data)
      if (msg) window.gridterm.contextEvent(id, msg.kind, msg.nonce, msg.payload)
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
      if (webgl) webglInUse--
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
      {props.finding && searchRef.current && <FindBar search={searchRef.current} accent={settings.theme.selectionBackground ?? '#264f78'} onClose={props.onCloseFind} />}
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
