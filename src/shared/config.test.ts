import { describe, expect, it } from 'vitest'
import { DEFAULTS, resolveKeys, validateConfig } from './config'
import { BUILTIN_THEMES, completeTheme, parseItermColors } from './themes'

const names = Object.keys(BUILTIN_THEMES)
const v = (raw: unknown, platform = 'linux') => validateConfig(raw, platform, names)

describe('validateConfig', () => {
  it('returns defaults for empty input', () => {
    expect(v({})).toEqual({ config: DEFAULTS, warnings: [] })
    expect(v(undefined).config).toEqual(DEFAULTS)
  })

  it('accepts valid values', () => {
    const { config, warnings } = v({ theme: 'Nord', font: { size: 15, family: 'Fira Code' }, cursor: { style: 'bar' }, window: { opacity: 0.9 } })
    expect(warnings).toEqual([])
    expect(config.theme).toBe('Nord')
    expect(config.font).toEqual({ ...DEFAULTS.font, size: 15, family: 'Fira Code' })
    expect(config.cursor.style).toBe('bar')
    expect(config.window.opacity).toBe(0.9)
  })

  it('falls back with a warning for bad values', () => {
    const { config, warnings } = v({ font: { size: 200 }, cursor: { style: 'box' }, colours: 1, window: { blur: 1 }, theme: 'Nope' })
    expect(config.font.size).toBe(DEFAULTS.font.size)
    expect(config.cursor.style).toBe('block')
    expect(config.theme).toBe(DEFAULTS.theme)
    expect(warnings).toHaveLength(5)
    expect(warnings.join('\n')).toMatch(/font.size should be a number from 6 to 72/)
  })

  it('handles key overrides, disabling and clashes', () => {
    const { config, warnings } = v({ keys: { 'new-session': 'Ctrl+Alt+N', 'select-1': false, bogus: 'Ctrl+B', 'nav-up': 'K', 'nav-down': 'Ctrl+Shift+W' } })
    const keys = resolveKeys(config, 'linux')
    expect(keys['new-session']).toBe('Ctrl+Alt+N')
    expect(keys['select-1']).toBeUndefined()
    expect(keys['nav-up']).toBe('Ctrl+Alt+Up') // bare key rejected
    expect(warnings.some((w) => w.includes('bogus'))).toBe(true)
    expect(warnings.some((w) => w.includes('needs a modifier'))).toBe(true)
    expect(warnings.some((w) => w.includes('used by both close-session and nav-down'))).toBe(true)
  })

  it('accepts inline custom themes', () => {
    const { config, warnings } = v({ theme: 'Mine', themes: { Mine: { background: '#101010' } } })
    expect(warnings).toEqual([])
    expect(config.theme).toBe('Mine')
  })
})

describe('themes', () => {
  it('completes partial themes and flags bad colours', () => {
    const { theme, invalid } = completeTheme({ background: '#000', foreground: '#fff', red: 'reddish', glow: '#fff' })
    expect(theme.background).toBe('#000')
    expect(theme.cursor).toBe('#fff')
    expect(theme.cursorAccent).toBe('#000')
    expect(invalid).toEqual(['red', 'glow'])
  })

  it('parses iTerm2 colour files', () => {
    const xml = `<plist><dict>
      <key>Ansi 1 Color</key><dict><key>Blue Component</key><real>0</real><key>Green Component</key><real>0</real><key>Red Component</key><real>1</real></dict>
      <key>Background Color</key><dict><key>Color Space</key><string>sRGB</string><key>Blue Component</key><real>0.5</real><key>Green Component</key><real>0.25</real><key>Red Component</key><real>0</real></dict>
    </dict></plist>`
    expect(parseItermColors(xml)).toEqual({ red: '#ff0000', background: '#004080' })
  })
})

import { validateUpdate } from './config'

describe('validateUpdate', () => {
  it('allows known settings with valid values', () => {
    expect(validateUpdate(['theme'], 'Nord', 'linux')).toBeNull()
    expect(validateUpdate(['font', 'size'], 14, 'linux')).toBeNull()
    expect(validateUpdate(['font', 'size'], undefined, 'linux')).toBeNull()
    expect(validateUpdate(['keys', 'nav-up'], 'Ctrl+Shift+Up', 'linux')).toBeNull()
    expect(validateUpdate(['keys', 'nav-up'], false, 'linux')).toBeNull()
    expect(validateUpdate(['app', 'confirmQuit'], false, 'linux')).toBeNull()
    expect(validateUpdate(['app', 'recordCommands'], false, 'linux')).toBeNull()
    expect(v({ app: { recordCommands: false } }).config.app.recordCommands).toBe(false)
  })

  it('rejects unknown or dangerous paths', () => {
    for (const p of [['__proto__', 'polluted'], ['constructor', 'prototype'], ['font', '__proto__'], ['keys', '__proto__'], ['font', 'size', 'x'], ['themes', 'Mine'], [], 'font.size', [1, 2]]) {
      expect(validateUpdate(p, 1, 'linux')).not.toBeNull()
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('rejects bad values', () => {
    expect(validateUpdate(['font', 'size'], 500, 'linux')).toMatch(/6 to 72/)
    expect(validateUpdate(['cursor', 'style'], 'box', 'linux')).not.toBeNull()
    expect(validateUpdate(['keys', 'copy'], 'K', 'linux')).toMatch(/modifier/)
    expect(validateUpdate(['keys', 'copy'], 'Hyper+K', 'linux')).toMatch(/valid shortcut/)
    expect(validateUpdate(['theme'], 5, 'linux')).not.toBeNull()
  })
})
