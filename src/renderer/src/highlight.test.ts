import { describe, expect, it } from 'vitest'
import { highlightLines, languageFor, splitHighlightedLines } from './highlight'

describe('languageFor', () => {
  it('uses extension, file name and shebang', () => {
    expect(languageFor('/a/b/app.tsx')).toBe('typescript')
    expect(languageFor('/a/Makefile')).toBe('makefile')
    expect(languageFor('/home/me/.zshrc')).toBe('bash')
    expect(languageFor('/usr/local/bin/tool', '#!/usr/bin/env python3')).toBe('python')
    expect(languageFor('/a/notes.txt')).toBeNull()
  })
})

describe('splitHighlightedLines', () => {
  it('keeps spans balanced across line breaks', () => {
    const html = 'a <span class="c">/* x\ny */</span> b\nc'
    expect(splitHighlightedLines(html)).toEqual(['a <span class="c">/* x</span>', '<span class="c">y */</span> b', 'c'])
  })

  it('handles nested spans', () => {
    const html = '<span class="a">1<span class="b">2\n3</span>4\n5</span>'
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="a">1<span class="b">2</span></span>',
      '<span class="a"><span class="b">3</span>4</span>',
      '<span class="a">5</span>'
    ])
  })
})

describe('highlightLines', () => {
  it('highlights known languages with one entry per line and escapes HTML', () => {
    const lines = highlightLines('/x/a.ts', 'const a = "<b>"\n// done')!
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('hljs-keyword')
    expect(lines[0]).toContain('&lt;b&gt;')
    expect(lines[1]).toContain('hljs-comment')
  })

  it('returns null for unknown types', () => {
    expect(highlightLines('/x/a.txt', 'hello')).toBeNull()
  })
})
