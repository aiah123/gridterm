import * as pty from 'node-pty'
import os from 'node:os'
import path from 'node:path'

export interface SessionEvents {
  onData(id: number, data: string): void
  onExit(id: number, exitCode: number): void
}

interface Session {
  id: number
  proc: pty.IPty
  buffer: string
  timer: NodeJS.Timeout | null
}

/** Batch PTY output into ~one IPC message per frame per session. */
const FLUSH_MS = 8

export class SessionManager {
  private sessions = new Map<number, Session>()
  private nextId = 1

  constructor(private events: SessionEvents) {}

  static defaultShell(): string {
    return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  }

  create(opts: { cols?: number; rows?: number; cwd?: string } = {}): { id: number; shell: string } {
    const shell = SessionManager.defaultShell()
    const id = this.nextId++
    const env = { ...process.env } as Record<string, string>
    env.TERM = 'xterm-256color'
    env.COLORTERM = 'truecolor'
    env.TERM_PROGRAM = 'gridterm'
    delete env.ELECTRON_RUN_AS_NODE

    const proc = pty.spawn(shell, ['-l'], {
      name: 'xterm-256color',
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      cwd: opts.cwd ?? os.homedir(),
      env
    })

    const session: Session = { id, proc, buffer: '', timer: null }
    this.sessions.set(id, session)

    proc.onData((data) => {
      session.buffer += data
      if (!session.timer) {
        session.timer = setTimeout(() => this.flush(session), FLUSH_MS)
      }
    })
    proc.onExit(({ exitCode }) => {
      this.flush(session)
      this.sessions.delete(id)
      this.events.onExit(id, exitCode)
    })

    return { id, shell: path.basename(shell) }
  }

  private flush(session: Session): void {
    if (session.timer) clearTimeout(session.timer)
    session.timer = null
    if (session.buffer) {
      const data = session.buffer
      session.buffer = ''
      this.events.onData(session.id, data)
    }
  }

  write(id: number, data: string): void {
    this.sessions.get(id)?.proc.write(data)
  }

  resize(id: number, cols: number, rows: number): void {
    if (cols < 1 || rows < 1) return
    try {
      this.sessions.get(id)?.proc.resize(Math.floor(cols), Math.floor(rows))
    } catch {
      // PTY may already be gone.
    }
  }

  kill(id: number): void {
    this.sessions.get(id)?.proc.kill()
  }

  killAll(): void {
    for (const s of this.sessions.values()) s.proc.kill()
  }
}
