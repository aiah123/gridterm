import type { SessionContext } from '../../shared/api'
import type { Session } from './App'

interface Props {
  session: Session
  context: SessionContext | undefined
  onPreview(path: string): void
  onInsert(text: string): void
}

/** Single-quote a path for the shell. */
export function shellQuote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`
}

function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function split(display: string): { name: string; dir: string } {
  const i = display.lastIndexOf('/')
  return i === -1 ? { name: display, dir: '' } : { name: display.slice(i + 1), dir: display.slice(0, i) || '/' }
}

/** Side panel shown next to the focused session. */
export function ContextPanel({ session, context, onPreview, onInsert }: Props) {
  const files = context?.files ?? []
  const commands = context?.commands ?? []
  return (
    <aside
      className="context-panel"
      onMouseDown={(e) => {
        // Keep keyboard focus in the terminal when clicking panel buttons.
        e.stopPropagation()
        e.preventDefault()
      }}
    >
      <h2>{session.name}</h2>
      {context?.cwdDisplay && (
        <div className="ctx-cwd" title={context.cwd ?? ''}>
          {context.cwdDisplay}
        </div>
      )}

      <section>
        <h3>Files</h3>
        {files.length === 0 ? (
          <p className="muted">Files you open in this session (vim, less, cat, …) will appear here.</p>
        ) : (
          <ul className="ctx-list" data-testid="ctx-files">
            {files.map((f) => {
              const { name, dir } = split(f.display)
              return (
                <li key={f.path} className="ctx-file" title={f.path}>
                  <button className="ctx-main" onClick={() => onPreview(f.path)}>
                    <span className="ctx-name">{name}</span>
                    <span className="ctx-sub">
                      {dir} · {f.via === 'process' ? 'detected' : f.via} · {ago(f.openedAt)}
                    </span>
                  </button>
                  <span className="ctx-actions">
                    <button title="Type an editor command into the terminal" onClick={() => onInsert(`\${EDITOR:-vi} ${shellQuote(f.path)}`)}>
                      Edit
                    </button>
                    <button title="Show in file manager" onClick={() => window.gridterm.revealFile(f.path)}>
                      Reveal
                    </button>
                    <button title="Remove from list" aria-label="Remove" onClick={() => window.gridterm.removeFile(session.id, f.path)}>
                      ×
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h3>Recent commands</h3>
        {commands.length === 0 ? (
          <p className="muted">Commands you run in this session will appear here.</p>
        ) : (
          <ul className="ctx-list" data-testid="ctx-commands">
            {commands.map((c, i) => (
              <li key={`${c.startedAt}-${i}`}>
                <button className="ctx-cmd" title="Type this command into the terminal" onClick={() => onInsert(c.command)}>
                  <span
                    className={`badge ${c.exitCode === undefined ? 'running' : c.exitCode === 0 ? 'ok' : 'fail'}`}
                    title={c.exitCode === undefined ? 'running' : `exit ${c.exitCode}`}
                  >
                    {c.exitCode === undefined ? '…' : c.exitCode === 0 ? '✓' : c.exitCode}
                  </span>
                  <code>{c.command}</code>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
