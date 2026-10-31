import { describe, expect, it } from 'vitest'
import { defaultBindings, matchBinding } from './keymap'

const key = (code: string, m: Partial<{ control: boolean; meta: boolean; alt: boolean; shift: boolean }> = {}) => ({
  type: 'keyDown',
  code,
  control: false,
  meta: false,
  alt: false,
  shift: false,
  ...m
})

describe('matchBinding', () => {
  const linux = defaultBindings('linux')
  const mac = defaultBindings('darwin')

  it('matches Linux shortcuts', () => {
    expect(matchBinding(linux, key('KeyT', { control: true, shift: true }))).toBe('new-session')
    expect(matchBinding(linux, key('ArrowLeft', { control: true, alt: true }))).toBe('nav-left')
    expect(matchBinding(linux, key('Digit3', { alt: true }))).toBe('select-3')
    expect(matchBinding(linux, key('Enter', { control: true, shift: true }))).toBe('toggle-focus')
  })

  it('leaves plain Ctrl keys for the shell', () => {
    expect(matchBinding(linux, key('KeyR', { control: true }))).toBeNull()
    expect(matchBinding(linux, key('KeyC', { control: true }))).toBeNull()
    expect(matchBinding(linux, key('KeyT', { control: true, shift: true, alt: true }))).toBeNull()
  })

  it('matches macOS shortcuts', () => {
    expect(matchBinding(mac, key('KeyR', { meta: true }))).toBe('rename-session')
    expect(matchBinding(mac, key('ArrowUp', { meta: true, alt: true }))).toBe('nav-up')
    expect(matchBinding(mac, key('Digit9', { meta: true }))).toBe('select-9')
  })

  it('ignores key up', () => {
    expect(matchBinding(linux, { ...key('KeyT', { control: true, shift: true }), type: 'keyUp' })).toBeNull()
  })
})
