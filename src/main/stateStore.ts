import { readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { CommandEntry, FileEntry } from '../shared/api'

export interface SavedSession {
  name: string
  cwd: string | null
  files: FileEntry[]
  commands: CommandEntry[]
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

export interface SavedState {
  version: 1
  sessions: SavedSession[]
  activeIndex: number
  window?: WindowBounds
}

const MAX_SAVED_COMMANDS = 30

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Validate a parsed state file; anything malformed is dropped rather than trusted. */
export function sanitizeState(raw: unknown): SavedState | null {
  if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.sessions)) return null
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  const sessions: SavedSession[] = []
  for (const s of raw.sessions.slice(0, 64)) {
    if (!isObj(s) || typeof s.name !== 'string') continue
    const files = Array.isArray(s.files)
      ? s.files.filter((f): f is FileEntry => isObj(f) && typeof f.path === 'string' && typeof f.display === 'string' && typeof f.openedAt === 'number' && typeof f.via === 'string')
      : []
    const commands = Array.isArray(s.commands)
      ? s.commands.filter((c): c is CommandEntry => isObj(c) && typeof c.command === 'string' && typeof c.cwd === 'string' && typeof c.startedAt === 'number' && typeof c.exitCode === 'number')
      : []
    sessions.push({ name: s.name.slice(0, 200), cwd: str(s.cwd), files, commands })
  }
  const activeIndex = typeof raw.activeIndex === 'number' && raw.activeIndex >= 0 && raw.activeIndex < sessions.length ? raw.activeIndex : 0
  let window: WindowBounds | undefined
  const w = raw.window
  if (isObj(w) && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(w[k])) && (w.width as number) >= 300 && (w.height as number) >= 200) {
    window = { x: w.x as number, y: w.y as number, width: w.width as number, height: w.height as number, maximized: w.maximized === true }
  }
  return { version: 1, sessions, activeIndex, window }
}

/** state.json next to config.toml: open sessions and window bounds at quit. */
export class StateStore {
  readonly file: string

  constructor(dir: string) {
    this.file = path.join(dir, 'state.json')
  }

  load(): SavedState | null {
    try {
      return sanitizeState(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch {
      return null
    }
  }

  /** Synchronous and atomic, so it is safe to call while the app is quitting. */
  save(state: SavedState): void {
    const trimmed: SavedState = {
      ...state,
      sessions: state.sessions.map((s) => ({
        ...s,
        // Commands still running at quit have no exit code; they are not saved.
        commands: s.commands.filter((c) => c.exitCode !== undefined).slice(0, MAX_SAVED_COMMANDS)
      }))
    }
    try {
      mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(trimmed, null, 2))
      renameSync(tmp, this.file)
    } catch {
      // Saving state is best effort.
    }
  }
}
