import { describe, expect, it } from 'vitest'
import { parseIntegrationMessage, singleLine, unescapePayload } from './osc'

describe('unescapePayload', () => {
  it('reverses the shell escaping', () => {
    expect(unescapePayload('printf "%s\\\\n" "multi\\nline"')).toBe('printf "%s\\n" "multi\nline"')
    expect(unescapePayload('a\\eb\\ac')).toBe('a\x1bb\x07c')
    expect(unescapePayload('plain;text')).toBe('plain;text')
  })
})

describe('parseIntegrationMessage', () => {
  it('splits kind, nonce and payload', () => {
    expect(parseIntegrationMessage('cmd;abc123;echo a;b\\nc')).toEqual({ kind: 'cmd', nonce: 'abc123', payload: 'echo a;b\nc' })
    expect(parseIntegrationMessage('cwd;n;')).toEqual({ kind: 'cwd', nonce: 'n', payload: '' })
  })

  it('rejects malformed messages', () => {
    expect(parseIntegrationMessage('cmd;nononce')).toBeNull()
    expect(parseIntegrationMessage(';n;x')).toBeNull()
    expect(parseIntegrationMessage('')).toBeNull()
  })
})

describe('singleLine', () => {
  it('removes line breaks and control characters', () => {
    expect(singleLine('git status\n\n\nrm -rf ~\n')).toBe('git status rm -rf ~')
    expect(singleLine("echo 'a\r\nb'")).toBe("echo 'a b'")
    expect(singleLine('a\x1b[200~b\x03c\x7fd\u009be')).toBe('a[200~bcde')
    expect(singleLine('  ls -la  ')).toBe('ls -la')
  })
})
