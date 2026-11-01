import { useEffect, useRef, useState } from 'react'
import type { ISearchOptions, SearchAddon } from '@xterm/addon-search'

/** Search box shown at the top-right of a session (Cmd+F / Ctrl+Shift+F). */
export function FindBar({ search, accent, onClose }: { search: SearchAddon; accent: string; onClose(): void }) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState<{ index: number; count: number } | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  const options: ISearchOptions = {
    caseSensitive,
    decorations: {
      matchBackground: accent,
      matchOverviewRuler: accent,
      activeMatchBackground: '#d18616',
      activeMatchColorOverviewRuler: '#d18616'
    }
  }

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
    const sub = search.onDidChangeResults((r) => setResults({ index: r.resultIndex, count: r.resultCount }))
    return () => {
      sub.dispose()
      search.clearDecorations()
    }
  }, [search])

  // Search as you type.
  useEffect(() => {
    if (query) search.findNext(query, { ...options, incremental: true })
    else {
      search.clearDecorations()
      setResults(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive])

  const next = (back: boolean) => {
    if (!query) return
    if (back) search.findPrevious(query, options)
    else search.findNext(query, options)
  }

  return (
    <div className="find-bar" onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        value={query}
        placeholder="Find"
        spellCheck={false}
        aria-label="Find in session"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') next(e.shiftKey)
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      />
      <span className="find-count" data-testid="find-count">
        {query ? (results && results.count > 0 ? `${results.index + 1}/${results.count}` : 'No results') : ''}
      </span>
      <button className={`icon-btn find-opt${caseSensitive ? ' on' : ''}`} title="Match case" aria-pressed={caseSensitive} onClick={() => setCaseSensitive((c) => !c)}>
        Aa
      </button>
      <button className="icon-btn" title="Previous (Shift+Enter)" aria-label="Previous match" onClick={() => next(true)}>
        ↑
      </button>
      <button className="icon-btn" title="Next (Enter)" aria-label="Next match" onClick={() => next(false)}>
        ↓
      </button>
      <button className="icon-btn" title="Close (Esc)" aria-label="Close find" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
