/** API exposed by the preload script on `window.gridterm`. */
export interface SessionInfo {
  id: number
  shell: string
}

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
}

export type AppCommand = 'new-session' | 'close-session'
