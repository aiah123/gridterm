import { useEffect, useMemo, useRef, useState } from 'react'
import { highlightLines } from './highlight'
import type { FileReadResult } from '../../shared/api'

/** Read-only file preview laid over the focused session. */
export function FilePreview({ path, onClose }: { path: string; onClose(): void }) {
  const [result, setResult] = useState<FileReadResult | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    setResult(null)
    window.gridterm.readFile(path).then((r) => live && setResult(r))
    ref.current?.focus()
    return () => {
      live = false
    }
  }, [path])

  const lines = useMemo(() => {
    if (!result?.ok) return [] as { html?: string; text: string }[]
    const text = result.text.endsWith('\n') ? result.text.slice(0, -1) : result.text
    const html = highlightLines(path, text)
    return text.split('\n').map((t, i) => ({ text: t, html: html?.[i] }))
  }, [result, path])

  return (
    <div
      className="preview"
      ref={ref}
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="preview-header">
        <span className="preview-path" title={path}>
          {path}
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Close preview" title="Close (Esc)">
          ×
        </button>
      </div>
      <div className="preview-body">
        {!result && <p className="muted">Loading…</p>}
        {result && !result.ok && <p className="muted">{result.error}</p>}
        {result?.ok && (
          <pre>
            {lines.map((l, i) => (
              <div key={i} className="line">
                <span className="ln">{i + 1}</span>
                {/* highlight.js output is HTML-escaped text wrapped in spans. */}
                {l.html !== undefined ? <span dangerouslySetInnerHTML={{ __html: l.html || ' ' }} /> : <span>{l.text || ' '}</span>}
              </div>
            ))}
            {result.truncated && <div className="muted">… preview truncated</div>}
          </pre>
        )}
      </div>
    </div>
  )
}
