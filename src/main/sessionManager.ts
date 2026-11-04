import * as pty from 'node-pty'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface SessionEvents {
  onData(id: number, data: string): void
  onExit(id: number, exitCode: number): void
}

interface Session {
  id: number
  proc: pty.IPty
  /**
   * Secret shared with this session's shell integration. Its messages carry
   * it, so text printed by programs (cat, curl, ssh…) can't forge them.
   */
  nonce: string
  buffer: string
  timer: NodeJS.Timeout | null
}

/**
 * On Linux node-pty forks the Electron process without closing its file
 * descriptors, so the shell (and everything run from it) would inherit
 * Electron's open files and sockets. Start the shell through bash, close
 * everything above stderr, then exec the real shell (same PID).
 * macOS is unaffected: node-pty uses POSIX_SPAWN_CLOEXEC_DEFAULT there.
 * Note: don't add `2>/dev/null` to the eval — bash makes redirections around
 * an `exec` permanent, which would send the shell's stderr (prompt) to /dev/null.
 */
const CLOSE_FDS_SCRIPT =
  'for fd in /proc/$$/fd/*; do fd=${fd##*/}; case $fd in 0|1|2|255) ;; *) eval "exec $fd>&-";; esac; done; exec "$@"'

function launcher(shell: string, args: string[]): [string, string[]] {
  if (process.platform === 'linux' && fs.existsSync('/bin/bash') && fs.existsSync('/proc/self/fd')) {
    return ['/bin/bash', ['-c', CLOSE_FDS_SCRIPT, 'gridterm-launch', shell, ...args]]
  }
  return [shell, args]
}

/** Batch PTY output into ~one IPC message per frame per session. */
const FLUSH_MS = 8

export class SessionManager {
  private sessions = new Map<number, Session>()
  private nextId = 1

  /** @param integrationDir directory holding resources/shell-integration */
  constructor(
    private events: SessionEvents,
    private integrationDir: string,
    private shellSettings: () => { program: string; integration: boolean }
  ) {}

  list(): { id: number; pid: number }[] {
    return [...this.sessions.values()].map((s) => ({ id: s.id, pid: s.proc.pid }))
  }

  /** Arguments and environment that load Gridterm's hooks into zsh/bash. */
  private shellLaunch(shell: string, env: Record<string, string>): string[] {
    const name = path.basename(shell)
    if (env.GRIDTERM_NO_SHELL_INTEGRATION || !this.shellSettings().integration) return ['-l']
    if (name === 'zsh') {
      if (env.ZDOTDIR) env.GRIDTERM_USER_ZDOTDIR = env.ZDOTDIR
      else delete env.GRIDTERM_USER_ZDOTDIR
      env.ZDOTDIR = path.join(this.integrationDir, 'zsh')
      return ['-l']
    }
    if (name === 'bash') {
      env.GRIDTERM_BASH_LOGIN = '1'
      return ['--rcfile', path.join(this.integrationDir, 'bash', 'gridterm.bash'), '-i']
    }
    return ['-l']
  }

  private shellPath(): string {
    const configured = this.shellSettings().program.trim()
    if (configured) return configured
    return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  }

  create(opts: { cols?: number; rows?: number; cwd?: string } = {}): { id: number; shell: string } {
    const shell = this.shellPath()
    const id = this.nextId++
    const env = { ...process.env } as Record<string, string>
    env.TERM = 'xterm-256color'
    env.COLORTERM = 'truecolor'
    env.TERM_PROGRAM = 'gridterm'
    delete env.ELECTRON_RUN_AS_NODE
    // The shell scripts read this once and unset it, so child processes don't inherit it.
    const nonce = randomBytes(16).toString('hex')
    env.GRIDTERM_NONCE = nonce

    const [file, args] = launcher(shell, this.shellLaunch(shell, env))
    const proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      cwd: opts.cwd ?? os.homedir(),
      env
    })

    const session: Session = { id, proc, nonce, buffer: '', timer: null }
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

  /** Was this shell-integration message really sent by the session's shell? */
  verifyNonce(id: number, nonce: unknown): boolean {
    const expected = this.sessions.get(id)?.nonce
    // String length is not UTF-8 byte length. Reject malformed output before
    // timingSafeEqual, which throws when its buffers have different lengths.
    if (!expected || typeof nonce !== 'string' || nonce.length !== 32 || !/^[0-9a-f]{32}$/.test(nonce)) return false
    return timingSafeEqual(Buffer.from(nonce), Buffer.from(expected))
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
