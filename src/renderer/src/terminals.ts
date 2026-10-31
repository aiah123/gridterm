import type { Terminal } from '@xterm/xterm'

/** Live xterm instances by session id, for app-level copy/paste. */
export const terminals = new Map<number, Terminal>()

// Exposed for end-to-end tests and debugging from devtools.
;(window as unknown as { __gridtermTerminals: typeof terminals }).__gridtermTerminals = terminals
