import { describe, expect, it } from 'vitest'
import { validArgs } from './ipcSchema'

describe('validArgs', () => {
  it('accepts well-formed calls', () => {
    expect(validArgs('pty:create', [])).toBe(true)
    expect(validArgs('pty:create', [{}])).toBe(true)
    expect(validArgs('pty:create', [{ restoreIndex: 2 }])).toBe(true)
    expect(validArgs('pty:write', [1, 'ls\r'])).toBe(true)
    expect(validArgs('pty:resize', [3, 120, 40])).toBe(true)
    expect(validArgs('state:layout', [[{ id: 1, name: 'api' }], 1])).toBe(true)
    expect(validArgs('state:layout', [[], null])).toBe(true)
    expect(validArgs('ctx:event', [1, 'cmd', 'abc', 'echo hi'])).toBe(true)
    expect(validArgs('config:update', [['font', 'size'], 14])).toBe(true)
    expect(validArgs('config:update', [['keys', 'copy'], undefined])).toBe(true)
    expect(validArgs('keys:suspend', [true])).toBe(true)
  })

  it('rejects wrong types, sizes and shapes', () => {
    expect(validArgs('pty:write', ['1', 'ls'])).toBe(false)
    expect(validArgs('pty:write', [1.5, 'ls'])).toBe(false)
    expect(validArgs('pty:write', [1, { toString: () => 'ls' }])).toBe(false)
    expect(validArgs('pty:resize', [1, 0, 40])).toBe(false)
    expect(validArgs('pty:resize', [1, 1e9, 40])).toBe(false)
    expect(validArgs('pty:create', [{ cwd: '/etc' }])).toBe(false) // unknown key
    expect(validArgs('pty:create', [JSON.parse('{"__proto__": {"x": 1}}')])).toBe(false)
    expect(validArgs('state:layout', [[{ id: 1 }], 1])).toBe(false)
    expect(validArgs('ctx:event', [1, 'evil', 'n', 'x'])).toBe(false)
    expect(validArgs('config:update', [['font', 'size'], { a: 1 }])).toBe(false)
    expect(validArgs('config:update', [['a', 'b', 'c', 'd'], 1])).toBe(false)
    expect(validArgs('keys:suspend', ['yes'])).toBe(false)
    expect(validArgs('link:open', ['x'.repeat(9000)])).toBe(false)
  })

  it('rejects extra arguments and unknown channels', () => {
    expect(validArgs('pty:kill', [1, 2])).toBe(false)
    expect(validArgs('clipboard:read', ['x'])).toBe(false)
    expect(validArgs('nope', [])).toBe(false)
  })
})
