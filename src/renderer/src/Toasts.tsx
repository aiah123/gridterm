export interface Toast {
  id: string
  title: string
  items: string[]
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss(id: string): void }) {
  if (!toasts.length) return null
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div className="toast" key={t.id} data-testid={`toast-${t.id}`}>
          <div className="toast-body">
            <strong>{t.title}</strong>
            {t.items.length > 0 && (
              <ul>
                {t.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </div>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => onDismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
