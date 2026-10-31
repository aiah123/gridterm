import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { CommandEntry, FileEntry, SessionContext } from '../shared/api'
import { filesFromCommand, swapFileTarget } from './commandParser'

const run = promisify(execFile)
const MAX_FILES = 100
const MAX_COMMANDS = 50
const POLL_MS = 2500
const IGNORED_PREFIXES = ['/dev/', '/proc/', '/sys/', '/usr/lib/', '/lib/', '/lib64/', '/System/', '/private/var/db/']

export function tildify(p: string, home = os.homedir()): string {
  if (p === home) return '~'
  return p.startsWith(home + '/') ? '~' + p.slice(home.length) : p
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile()
  } catch {
    return false
  }
}

/**
 * Per-session context: current directory, recent commands, and files the
 * session opened. Fed by shell integration events and by polling the
 * foreground process's open files.
 */
export class ContextTracker {
  private contexts = new Map<number, SessionContext>()
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private home = os.homedir()

  constructor(
    private onUpdate: (id: number, ctx: SessionContext) => void,
    private listSessions: () => { id: number; pid: number }[]
  ) {}

  get(id: number): SessionContext {
    let ctx = this.contexts.get(id)
    if (!ctx) {
      ctx = { cwd: null, cwdDisplay: null, files: [], commands: [] }
      this.contexts.set(id, ctx)
    }
    return ctx
  }

  remove(id: number): void {
    this.contexts.delete(id)
  }

  /** True if `p` is listed in some session's context (guards file reads). */
  isKnownFile(p: string): boolean {
    for (const ctx of this.contexts.values()) if (ctx.files.some((f) => f.path === p)) return true
    return false
  }

  private emit(id: number): void {
    const ctx = this.get(id)
    this.onUpdate(id, { ...ctx, files: [...ctx.files], commands: [...ctx.commands] })
  }

  async handleEvent(id: number, kind: string, payload: string): Promise<void> {
    const ctx = this.get(id)
    if (kind === 'cwd') {
      if (ctx.cwd === payload) return
      ctx.cwd = payload
      ctx.cwdDisplay = tildify(payload, this.home)
      this.emit(id)
    } else if (kind === 'cmd') {
      const command = payload.trim()
      if (!command) return
      const cwd = ctx.cwd ?? this.home
      ctx.commands.unshift({ command, cwd, startedAt: Date.now() })
      ctx.commands.length = Math.min(ctx.commands.length, MAX_COMMANDS)
      this.emit(id)
      const found = filesFromCommand(command, cwd, this.home)
      for (const { program, paths } of found) {
        for (const p of paths) if (await isFile(p)) this.addFile(id, p, program, false)
      }
      if (found.length) this.emit(id)
    } else if (kind === 'done') {
      const last = ctx.commands[0]
      if (last && last.exitCode === undefined) {
        last.exitCode = Number(payload)
        this.emit(id)
      }
    }
  }

  private addFile(id: number, p: string, via: string, emit = true): void {
    const ctx = this.get(id)
    const existing = ctx.files.findIndex((f) => f.path === p)
    const entry: FileEntry = { path: p, display: tildify(p, this.home), openedAt: Date.now(), via }
    if (existing !== -1) {
      // Seen again by polling: keep its position and original opener.
      if (via === 'process') return
      ctx.files.splice(existing, 1)
    }
    ctx.files.unshift(entry)
    ctx.files.length = Math.min(ctx.files.length, MAX_FILES)
    if (emit) this.emit(id)
  }

  removeFile(id: number, p: string): void {
    const ctx = this.get(id)
    ctx.files = ctx.files.filter((f) => f.path !== p)
    this.emit(id)
  }

  // ---- open-file polling ----

  start(): void {
    if (!this.timer) this.timer = setInterval(() => void this.poll(), POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      for (const { id, pid } of this.listSessions()) {
        const fg = await foregroundPid(pid)
        if (!fg || fg === pid) continue // shell is at the prompt
        // Ignore anything the shell itself holds open (inherited, not opened by the command).
        const shellFiles = new Set(await openFiles(pid))
        const paths = (await openFiles(fg)).filter((p) => !shellFiles.has(p))
        let changed = false
        for (const raw of paths) {
          const p = swapFileTarget(raw) ?? raw
          if (IGNORED_PREFIXES.some((pre) => p.startsWith(pre)) || p.includes('/.git/')) continue
          if (/\.(so(\.\d+)*|dylib|node)$/.test(p)) continue
          if (this.get(id).files.some((f) => f.path === p)) continue
          if (!(await isFile(p))) continue
          this.addFile(id, p, 'process', false)
          changed = true
        }
        if (changed) this.emit(id)
      }
    } catch {
      // Processes come and go; ignore races.
    } finally {
      this.polling = false
    }
  }
}

/** PID of the terminal's foreground process group leader for a shell. */
export async function foregroundPid(shellPid: number): Promise<number | null> {
  try {
    if (process.platform === 'linux') {
      const stat = await fs.readFile(`/proc/${shellPid}/stat`, 'utf8')
      // Fields after "(comm)": state ppid pgrp session tty_nr tpgid ...
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      const tpgid = Number(fields[5])
      return tpgid > 0 ? tpgid : null
    }
    const { stdout } = await run('ps', ['-o', 'tpgid=', '-p', String(shellPid)])
    const tpgid = Number(stdout.trim())
    return tpgid > 0 ? tpgid : null
  } catch {
    return null
  }
}

/** Absolute paths of files a process has open. */
export async function openFiles(pid: number): Promise<string[]> {
  try {
    if (process.platform === 'linux') {
      const dir = `/proc/${pid}/fd`
      const fds = await fs.readdir(dir)
      const links = await Promise.all(fds.map((fd) => fs.readlink(path.join(dir, fd)).catch(() => '')))
      return links.filter((l) => l.startsWith('/'))
    }
    // macOS: numeric file descriptors only, names in "n<path>" lines.
    const { stdout } = await run('lsof', ['-a', '-p', String(pid), '-d', '0-9999', '-Fn'], { timeout: 2000 })
    return stdout
      .split('\n')
      .filter((l) => l.startsWith('n/'))
      .map((l) => l.slice(1))
  } catch {
    return []
  }
}
