import { describe, expect, it, vi } from 'vitest'
import { ContextTracker } from './contextTracker'

describe('command recording privacy', () => {
  it('drops new and restored commands while disabled and clears live history', async () => {
    let enabled = true
    const update = vi.fn()
    const tracker = new ContextTracker(update, () => [], () => enabled)
    await tracker.handleEvent(1, 'cmd', 'echo public')
    await tracker.handleEvent(1, 'done', '0')
    expect(tracker.get(1).commands).toHaveLength(1)
    enabled = false
    tracker.clearCommands()
    expect(update.mock.calls.at(-1)![1].commands).toEqual([])
    await tracker.handleEvent(1, 'cmd', 'SECRET=dummy')
    await tracker.handleEvent(1, 'done', '0')
    tracker.seed(2, { cwd: '/tmp', files: [], commands: [{ command: 'SECRET=old', cwd: '/tmp', startedAt: 1, exitCode: 0 }] })
    expect(tracker.get(1).commands).toEqual([])
    expect(tracker.get(2).commands).toEqual([])
    await tracker.handleEvent(1, 'cwd', '/tmp')
    expect(tracker.get(1).cwd).toBe('/tmp')
    enabled = true
    await tracker.handleEvent(1, 'cmd', 'echo resumed')
    expect(tracker.get(1).commands[0].command).toBe('echo resumed')
  })
})
