/** API exposed by the preload script on `window.gridterm`. */
export interface SessionInfo {
  id: number
  shell: string
}

export interface FileEntry {
  path: string
  /** Path with the home directory shown as ~ */
  display: string
  openedAt: number
  /** Program that opened it, or 'process' if seen as an open file. */
  via: string
}

export interface CommandEntry {
  command: string
  cwd: string
  startedAt: number
  exitCode?: number
}

export interface SessionContext {
  cwd: string | null
  cwdDisplay: string | null
  files: FileEntry[]
  commands: CommandEntry[]
}

export type FileReadResult =
  | { ok: true; text: string; truncated: boolean; size: number }
  | { ok: false; error: string }

export interface GridtermApi {
  platform: NodeJS.Platform
  createSession(opts?: { cols?: number; rows?: number; cwd?: string }): Promise<SessionInfo>
  write(id: number, data: string): void
  resize(id: number, cols: number, rows: number): void
  kill(id: number): void
  /** Subscribe to PTY output; data emitted before subscribing is replayed. */
  onData(id: number, cb: (data: string) => void): () => void
  onExit(cb: (id: number, exitCode: number) => void): () => void
  onCommand(cb: (command: AppCommand) => void): () => void
  closeWindow(): void
  /** Forward a shell-integration event (OSC 7770) from a terminal. */
  contextEvent(id: number, kind: string, payload: string): void
  onContext(cb: (id: number, ctx: SessionContext) => void): () => void
  removeFile(id: number, path: string): void
  readFile(path: string): Promise<FileReadResult>
  revealFile(path: string): void
}

export type AppCommand =
  | 'new-session'
  | 'close-session'
  | 'rename-session'
  | 'toggle-focus'
  | `nav-${'left' | 'right' | 'up' | 'down'}`
  | `select-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
