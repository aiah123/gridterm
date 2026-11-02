import type { AppCommand } from './commands'
import type { ResolvedConfig } from './config'

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

/** A session saved at quit, offered once at startup. */
export interface RestoreInfo {
  sessions: { name: string }[]
  activeIndex: number
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
  /** `restoreIndex` picks a session saved at the last quit (its cwd and context). */
  createSession(opts?: { cols?: number; rows?: number; restoreIndex?: number }): Promise<SessionInfo>
  write(id: number, data: string): void
  resize(id: number, cols: number, rows: number): void
  kill(id: number): void
  /** Subscribe to PTY output; data emitted before subscribing is replayed. */
  onData(id: number, cb: (data: string) => void): () => void
  onExit(cb: (id: number, exitCode: number) => void): () => void
  onCommand(cb: (command: AppCommand) => void): () => void
  closeWindow(): void
  /** Forward a shell-integration event (OSC 7770) from a terminal; the main process checks the nonce. */
  contextEvent(id: number, kind: string, nonce: string, payload: string): void
  onContext(cb: (id: number, ctx: SessionContext) => void): () => void
  removeFile(id: number, path: string): void
  readFile(path: string): Promise<FileReadResult>
  revealFile(path: string): void

  /** Saved sessions to reopen (only returned once, at startup). */
  getRestore(): Promise<RestoreInfo | null>
  /** Report session names/order/active so they can be saved. */
  reportLayout(sessions: { id: number; name: string }[], activeId: number | null): void
  openLink(url: string): void

  getConfig(): Promise<ResolvedConfig>
  onConfig(cb: (rc: ResolvedConfig) => void): () => void
  /** Set one setting, e.g. (['font', 'size'], 14). `undefined` resets it to the default. */
  updateConfig(path: string[], value: unknown): Promise<void>
  openConfigFile(): void
  /** Pick an .itermcolors or .json file; returns the new theme's name. */
  importTheme(): Promise<string | null>
  /** Pause app shortcuts (while recording a new one in settings). */
  suspendShortcuts(suspend: boolean): void
  copyText(text: string): void
  readClipboard(): Promise<string>
  /** Native paste into the focused text field. */
  pasteNative(): void
}

export type { AppCommand } from './commands'
