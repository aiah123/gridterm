import { describe, expect, it } from 'vitest'
import { displayAccelerator, fromKeyEvent, matches, parseAccelerator, sameAccelerator } from './accelerator'

const ev = (code: string, m: Partial<{ control: boolean; meta: boolean; alt: boolean; shift: boolean }> = {}) =>
  ({ code, control: false, meta: false, alt: false, shift: false, ...m })

describe('accelerators', () => {
  it('parses common forms', () => {
    expect(parseAccelerator('Ctrl+Shift+T', 'linux')).toEqual({ control: true, shift: true, meta: false, alt: false, code: 'KeyT' })
    expect(parseAccelerator('Cmd+Alt+Up', 'darwin')?.code).toBe('ArrowUp')
    expect(parseAccelerator('CmdOrCtrl+,', 'darwin')).toMatchObject({ meta: true, code: 'Comma' })
    expect(parseAccelerator('CmdOrCtrl+,', 'linux')).toMatchObject({ control: true, code: 'Comma' })
    expect(parseAccelerator('Ctrl++', 'linux')).toMatchObject({ control: true, code: 'Equal' })
    expect(parseAccelerator('F2', 'linux')?.code).toBe('F2')
  })

  it('rejects junk', () => {
    expect(parseAccelerator('Ctrl+Shift+', 'linux')).toBeNull()
    expect(parseAccelerator('Hyper+T', 'linux')).toBeNull()
    expect(parseAccelerator('Ctrl+Foo', 'linux')).toBeNull()
    expect(parseAccelerator('', 'linux')).toBeNull()
  })

  it('matches key events exactly', () => {
    const p = parseAccelerator('Ctrl+Shift+T', 'linux')!
    expect(matches(p, ev('KeyT', { control: true, shift: true }))).toBe(true)
    expect(matches(p, ev('KeyT', { control: true }))).toBe(false)
    expect(matches(p, ev('KeyT', { control: true, shift: true, alt: true }))).toBe(false)
    expect(matches(parseAccelerator('Alt+1', 'linux')!, ev('Numpad1', { alt: true }))).toBe(true)
  })

  it('round-trips from key events', () => {
    expect(fromKeyEvent(ev('KeyN', { control: true, alt: true }), 'linux')).toBe('Ctrl+Alt+N')
    expect(fromKeyEvent(ev('ArrowUp', { meta: true, shift: true }), 'darwin')).toBe('Cmd+Shift+Up')
    expect(fromKeyEvent(ev('Comma', { control: true }), 'linux')).toBe('Ctrl+,')
    expect(fromKeyEvent(ev('ShiftLeft', { shift: true }), 'linux')).toBeNull()
    for (const a of ['Ctrl+Alt+N', 'Ctrl+Shift+=', 'Super+Down']) {
      const p = parseAccelerator(a, 'linux')!
      expect(fromKeyEvent(p, 'linux')).toBe(a)
    }
  })

  it('displays nicely', () => {
    expect(displayAccelerator('Cmd+Alt+Up', 'darwin')).toBe('⌥⌘↑')
    expect(displayAccelerator('Ctrl+Shift+Enter', 'linux')).toBe('Ctrl+Shift+Enter')
    expect(sameAccelerator('Control+shift+t', 'Ctrl+Shift+T', 'linux')).toBe(true)
  })
})
