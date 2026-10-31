import { CSSProperties, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { unescapePayload } from './osc'

interface Props {
  id: number
  name: string
  cwd: string | null
  refocus: number
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

const theme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  selectionBackground: '#264f78'
}

export function SessionTile(props: Props) {
  const { id, name, cwd, active, focused, renaming, style } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  // Create the terminal once per session; it survives layout changes.
  useEffect(() => {
    const host = hostRef.current!
    const term = new Terminal({
      fontFamily: 'Menlo, "DejaVu Sans Mono", "Liberation Mono", monospace',
      fontSize: 13,
      scrollback: 10000,
      cursorBlink: true,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme
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

    // Shell integration events: ESC ] 7770 ; kind ; payload BEL
    const osc = term.parser.registerOscHandler(7770, (data) => {
      const sep = data.indexOf(';')
      if (sep === -1) return true
      window.gridterm.contextEvent(id, data.slice(0, sep), unescapePayload(data.slice(sep + 1)))
      return true
    })

    const offData = window.gridterm.onData(id, (d) => term.write(d))
    const input = term.onData((d) => window.gridterm.write(id, d))

    // Keep PTY size in sync with the tile (debounced during drags/animations).
    let timer: ReturnType<typeof setTimeout> | undefined
    const doFit = () => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return
      fit.fit()
      window.gridterm.resize(id, term.cols, term.rows)
    }
    doFit()
    const ro = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(doFit, 30)
    })
    ro.observe(host)

    return () => {
      clearTimeout(timer)
      ro.disconnect()
      input.dispose()
      osc.dispose()
      offData()
      term.dispose()
      termRef.current = null
    }
  }, [id])

  // Only the active tile receives keyboard input. Re-run when focus mode or
  // renaming changes, since those move keyboard focus away from the terminal.
  useEffect(() => {
    if (active && !renaming) termRef.current?.focus()
    else termRef.current?.blur()
  }, [active, focused, renaming, props.refocus])

  return (
    <div
      className={`tile${active ? ' active' : ''}${focused ? ' focused' : ''}`}
      style={style}
      data-session-id={id}
      onMouseDown={props.onActivate}
    >
      <div className="title" onDoubleClick={props.onStartRename} title="Double-click to rename">
        {renaming ? (
          <RenameInput initial={name} onDone={props.onRename} onCancel={props.onCancelRename} />
        ) : (
          <>
            {name}
            {cwd && <span className="cwd"> — {cwd}</span>}
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
