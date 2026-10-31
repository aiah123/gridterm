import { describe, expect, it } from 'vitest'
import { unescapePayload } from './osc'

describe('unescapePayload', () => {
  it('reverses the shell escaping', () => {
    expect(unescapePayload('printf "%s\\\\n" "multi\\nline"')).toBe('printf "%s\\n" "multi\nline"')
    expect(unescapePayload('a\\eb\\ac')).toBe('a\x1bb\x07c')
    expect(unescapePayload('plain;text')).toBe('plain;text')
  })
})
