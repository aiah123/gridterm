import { describe, expect, it, vi } from 'vitest'
import * as pty from 'node-pty'
import { SessionManager } from './sessionManager'
import { validArgs } from './ipcSchema'
import { parseIntegrationMessage } from '../renderer/src/osc'

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({ pid: 123, onData: vi.fn(), onExit: vi.fn() }))
}))

describe('shell integration authentication', () => {
  it('rejects malformed terminal output without throwing and accepts only the session nonce', () => {
    const manager = new SessionManager({ onData() {}, onExit() {} }, '/integration', () => ({ program: '/bin/bash', integration: true }))
    const { id } = manager.create()
    const nonce = vi.mocked(pty.spawn).mock.calls.at(-1)![2]!.env!.GRIDTERM_NONCE!
    expect(manager.verifyNonce(id, nonce)).toBe(true)
    expect(manager.verifyNonce(id + 1, nonce)).toBe(false)
    for (const bad of ['é'.repeat(32), '😀'.repeat(16), 'g'.repeat(32), 'a'.repeat(31), nonce + '\n', null, 123]) {
      expect(manager.verifyNonce(id, bad)).toBe(false)
    }
    const msg = parseIntegrationMessage(`cwd;${'é'.repeat(32)};/tmp`)!
    expect(validArgs('ctx:event', [id, msg.kind, msg.nonce, msg.payload])).toBe(true)
    expect(manager.verifyNonce(id, msg.nonce)).toBe(false)
    const other = (nonce[0] === 'a' ? 'b' : 'a') + nonce.slice(1)
    expect(manager.verifyNonce(id, other)).toBe(false)
  })
})
