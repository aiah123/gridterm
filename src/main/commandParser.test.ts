import { describe, expect, it } from 'vitest'
import { filesFromCommand, swapFileTarget, tokenize } from './commandParser'

const words = (line: string) => tokenize(line).map((t) => (t.op ? `<${t.value}>` : t.value))
const files = (line: string) => filesFromCommand(line, '/work', '/home/me').flatMap((r) => r.paths)

describe('tokenize', () => {
  it('handles quotes, escapes and operators', () => {
    expect(words(`vim 'my file.txt' "a \\"b\\"" c\\ d`)).toEqual(['vim', 'my file.txt', 'a "b"', 'c d'])
    expect(words('cat a | less && echo hi; ls')).toEqual(['cat', 'a', '<|>', 'less', '<&&>', 'echo', 'hi', '<;>', 'ls'])
    expect(words('echo hi # comment')).toEqual(['echo', 'hi'])
    expect(words('echo a#b')).toEqual(['echo', 'a#b'])
  })
})

describe('filesFromCommand', () => {
  it('finds editor and pager arguments relative to cwd', () => {
    expect(files('vim notes.md')).toEqual(['/work/notes.md'])
    expect(files('nvim -O a.ts ../b.ts')).toEqual(['/work/a.ts', '/b.ts'])
    expect(files('less ~/log.txt')).toEqual(['/home/me/log.txt'])
    expect(files('vim +42 src/app.ts')).toEqual(['/work/src/app.ts'])
    expect(files('cat -- -weird')).toEqual(['/work/-weird'])
  })

  it('ignores non-file commands and URLs', () => {
    expect(files('ls -la')).toEqual([])
    expect(files('grep foo bar.txt')).toEqual([])
    expect(files('open https://example.com')).toEqual([])
  })

  it('looks past wrappers and env assignments', () => {
    expect(files('sudo -u root vim /etc/hosts')).toEqual(['/etc/hosts'])
    expect(files('EDITOR=x env -i FOO=1 nano a')).toEqual(['/work/a'])
    expect(files('/usr/bin/vim a')).toEqual(['/work/a'])
  })

  it('handles pipelines, lists and redirects', () => {
    expect(files('cat a.log | grep x > out.txt && less b.log')).toEqual(['/work/a.log', '/work/b.log'])
    expect(files('cat < in.txt')).toEqual([])
  })
})

describe('swapFileTarget', () => {
  it('maps vim swap files back to the edited file', () => {
    expect(swapFileTarget('/dir/.notes.txt.swp')).toBe('/dir/notes.txt')
    expect(swapFileTarget('/dir/.notes.txt.swo')).toBe('/dir/notes.txt')
    expect(swapFileTarget('/home/me/.local/state/nvim/swap/%home%me%a.txt.swp')).toBe('/home/me/a.txt')
    expect(swapFileTarget('/dir/notes.txt')).toBeNull()
  })
})
