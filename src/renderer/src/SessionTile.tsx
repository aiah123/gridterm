import { CSSProperties, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

interface Props {
  id: number
  name: string
  active: boolean
  onActivate(): void
  style: CSSProperties
}

const theme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  selectionBackground: '#264f78'
}

export function SessionTile({ id, name, active, onActivate, style }: Props) {
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
      offData()
      term.dispose()
      termRef.current = null
    }
  }, [id])

  // Only the active tile receives keyboard input.
  useEffect(() => {
    if (active) termRef.current?.focus()
    else termRef.current?.blur()
  }, [active])

  return (
    <div
      className={`tile${active ? ' active' : ''}`}
      style={style}
      data-session-id={id}
      onMouseDown={onActivate}
    >
      <div className="title">{name}</div>
      <div className="term" ref={hostRef} />
    </div>
  )
}
