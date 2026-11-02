import { describe, expect, it } from 'vitest'
import { isTrustedUrl } from './trust'

describe('isTrustedUrl', () => {
  const file = 'file:///home/me/gridterm/out/renderer/index.html'
  it('accepts the app page, ignoring hash and query', () => {
    expect(isTrustedUrl(file, file)).toBe(true)
    expect(isTrustedUrl(file + '#x', file)).toBe(true)
    expect(isTrustedUrl('http://localhost:5173/', 'http://localhost:5173/')).toBe(true)
    expect(isTrustedUrl('http://localhost:5173/src/x?y', 'http://localhost:5173/')).toBe(true)
  })

  it('rejects other pages', () => {
    expect(isTrustedUrl('file:///tmp/evil.html', file)).toBe(false)
    expect(isTrustedUrl('file:///home/me/gridterm/out/renderer/index.html.evil', file)).toBe(false)
    expect(isTrustedUrl('https://example.com/', file)).toBe(false)
    expect(isTrustedUrl('http://localhost:5174/', 'http://localhost:5173/')).toBe(false)
    expect(isTrustedUrl('http://evil.localhost:5173/', 'http://localhost:5173/')).toBe(false)
    expect(isTrustedUrl('data:text/html,hi', file)).toBe(false)
    expect(isTrustedUrl('not a url', file)).toBe(false)
  })
})
