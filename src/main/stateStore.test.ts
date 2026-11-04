import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { sanitizeState, StateStore } from './stateStore'

describe('sanitizeState', () => {
  it('rejects junk', () => {
    expect(sanitizeState(null)).toBeNull()
    expect(sanitizeState({ version: 2, sessions: [] })).toBeNull()
    expect(sanitizeState({ version: 1 })).toBeNull()
  })

  it('keeps valid sessions and drops bad entries', () => {
    const s = sanitizeState({
      version: 1,
      activeIndex: 9,
      sessions: [
        { name: 'api', cwd: '/srv', files: [{ path: '/a', display: '/a', openedAt: 1, via: 'vim' }, { path: 3 }], commands: [{ command: 'ls', cwd: '/', startedAt: 1, exitCode: 0 }, { command: 'x' }] },
        { cwd: '/no-name' },
        { name: 'web', cwd: 5 }
      ],
      window: { x: 10, y: 20, width: 100, height: 100 }
    })!
    expect(s.sessions.map((x) => x.name)).toEqual(['api', 'web'])
    expect(s.sessions[0].files).toHaveLength(1)
    expect(s.sessions[0].commands).toHaveLength(1)
    expect(s.sessions[1].cwd).toBeNull()
    expect(s.activeIndex).toBe(0)
    expect(s.window).toBeUndefined() // too small
  })
})

describe('StateStore', () => {
  it('migrates existing permissions and keeps atomic replacements private', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gt-state-private-'))
    try {
      const store = new StateStore(dir)
      const state = { version: 1 as const, activeIndex: 0, sessions: [] }
      chmodSync(dir, 0o755)
      writeFileSync(store.file, JSON.stringify(state), { mode: 0o644 })
      expect(store.load()).toEqual(state)
      expect(statSync(dir).mode & 0o777).toBe(0o700)
      expect(statSync(store.file).mode & 0o777).toBe(0o600)
      store.save(state)
      expect(statSync(store.file).mode & 0o777).toBe(0o600)
      expect(readdirSync(dir)).toEqual(['state.json'])
      const nested = new StateStore(path.join(dir, 'new'))
      nested.save(state)
      expect(statSync(path.dirname(nested.file)).mode & 0o777).toBe(0o700)
      expect(statSync(nested.file).mode & 0o777).toBe(0o600)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('does not follow a state-file symlink or change its target permissions', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gt-state-link-'))
    try {
      const target = path.join(dir, 'target')
      writeFileSync(target, 'keep', { mode: 0o644 })
      chmodSync(target, 0o644)
      const store = new StateStore(dir)
      symlinkSync(target, store.file)
      expect(store.load()).toBeNull()
      expect(statSync(target).mode & 0o777).toBe(0o644)
      store.save({ version: 1, activeIndex: 0, sessions: [] })
      expect(readFileSync(target, 'utf8')).toBe('keep')
      expect(store.load()?.sessions).toEqual([])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('does not restore or persist commands when recording is disabled', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gt-state-optout-'))
    try {
      let recording = true
      const store = new StateStore(dir, () => recording)
      const state = { version: 1 as const, activeIndex: 0, sessions: [{ name: 'test', cwd: '/tmp', files: [], commands: [{ command: 'SECRET=dummy', cwd: '/tmp', startedAt: 1, exitCode: 0 }] }] }
      store.save(state)
      recording = false
      expect(store.load()!.sessions[0].commands).toEqual([])
      store.save(state)
      expect(readFileSync(store.file, 'utf8')).not.toContain('SECRET')
      expect(state.sessions[0].commands).toHaveLength(1)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('round-trips and drops still-running commands', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gt-state-'))
    const store = new StateStore(dir)
    expect(store.load()).toBeNull()
    store.save({
      version: 1,
      activeIndex: 1,
      sessions: [
        { name: 'a', cwd: '/tmp', files: [], commands: [{ command: 'vim x', cwd: '/tmp', startedAt: 2 }, { command: 'ls', cwd: '/tmp', startedAt: 1, exitCode: 0 }] },
        { name: 'b', cwd: null, files: [], commands: [] }
      ],
      window: { x: 0, y: 0, width: 800, height: 600, maximized: true }
    })
    const loaded = store.load()!
    expect(loaded.sessions[0].commands.map((c) => c.command)).toEqual(['ls'])
    expect(loaded.activeIndex).toBe(1)
    expect(loaded.window?.maximized).toBe(true)
    writeFileSync(store.file, '{not json')
    expect(store.load()).toBeNull()
    expect(readFileSync(store.file, 'utf8')).toBe('{not json')
  })
})
