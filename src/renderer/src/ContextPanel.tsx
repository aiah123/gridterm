import type { Session } from './App'

/** Side panel shown next to the focused session. Filled in by M4–M5. */
export function ContextPanel({ session }: { session: Session }) {
  return (
    <aside className="context-panel" onMouseDown={(e) => e.stopPropagation()}>
      <h2>{session.name}</h2>
      <section>
        <h3>Files</h3>
        <p className="muted">Files opened in this session will appear here.</p>
      </section>
      <section>
        <h3>Recent commands</h3>
        <p className="muted">Commands run in this session will appear here.</p>
      </section>
    </aside>
  )
}
