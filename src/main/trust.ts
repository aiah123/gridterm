/**
 * Is `url` Gridterm's own page? `expected` is the renderer URL: the dev
 * server origin (http://localhost:…/) or the built index.html (file://…).
 * Query strings and #hashes are ignored; anything else must match.
 */
export function isTrustedUrl(url: string, expected: string): boolean {
  try {
    const u = new URL(url)
    const e = new URL(expected)
    if (u.protocol !== e.protocol) return false
    if (e.protocol === 'file:') return u.pathname === e.pathname && u.host === e.host
    return u.origin === e.origin
  } catch {
    return false
  }
}
