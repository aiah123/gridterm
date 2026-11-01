import path from 'node:path'

/** Programs whose file arguments count as "opened" files. */
export const FILE_COMMANDS = new Set([
  'vi', 'vim', 'nvim', 'gvim', 'mvim', 'view', 'vimdiff', 'nvimdiff',
  'nano', 'pico', 'emacs', 'emacsclient', 'micro', 'hx', 'helix', 'kak', 'ne', 'joe', 'mcedit',
  'less', 'more', 'most', 'bat', 'batcat', 'cat', 'head', 'tail', 'tac', 'nl',
  'code', 'cursor', 'subl', 'zed', 'mate', 'open', 'xdg-open'
])

/** Commands that run another command; we look past them. */
const WRAPPERS: Record<string, Set<string>> = {
  // wrapper -> flags that take a value
  sudo: new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U']),
  doas: new Set(['-u', '-C']),
  env: new Set(['-u', '-C', '-S']),
  nice: new Set(['-n']),
  nohup: new Set(),
  time: new Set(),
  command: new Set(),
  exec: new Set(['-a']),
  builtin: new Set()
}

type Token = { op: false; value: string } | { op: true; value: string }

/** Split a shell command line into words and operators, honouring quotes. */
export function tokenize(line: string): Token[] {
  const tokens: Token[] = []
  let word = ''
  let inWord = false
  const push = () => {
    if (inWord) tokens.push({ op: false, value: word })
    word = ''
    inWord = false
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "'") {
      const end = line.indexOf("'", i + 1)
      const stop = end === -1 ? line.length : end
      word += line.slice(i + 1, stop)
      inWord = true
      i = stop
    } else if (c === '"') {
      inWord = true
      for (i++; i < line.length && line[i] !== '"'; i++) {
        if (line[i] === '\\' && '"\\$`\n'.includes(line[i + 1] ?? '')) i++
        word += line[i]
      }
    } else if (c === '\\') {
      if (i + 1 < line.length && line[i + 1] !== '\n') {
        word += line[++i]
        inWord = true
      } else i++
    } else if (c === ' ' || c === '\t') {
      push()
    } else if ('|&;()\n<>'.includes(c)) {
      push()
      let op = c
      if ((c === '|' || c === '&' || c === '>' || c === '<') && line[i + 1] === c) op += line[++i]
      tokens.push({ op: true, value: op })
    } else if (c === '#' && !inWord) {
      break // comment
    } else {
      word += c
      inWord = true
    }
  }
  push()
  return tokens
}

function expandHome(p: string, home: string): string {
  if (p === '~') return home
  if (p.startsWith('~/')) return path.join(home, p.slice(2))
  return p
}

/**
 * Candidate file paths a command line opens. Paths are absolute but not yet
 * checked to exist; the caller filters to real files.
 */
export function filesFromCommand(line: string, cwd: string, home: string): { program: string; paths: string[] }[] {
  const results: { program: string; paths: string[] }[] = []
  const tokens = tokenize(line)
  // `cd dir && vim file` opens dir/file: follow cd/pushd within the line.
  let dir = cwd
  let segment: string[] = []
  let skipNext = false // word after a redirect operator

  const flush = () => {
    let words = segment
    segment = []
    // Leading VAR=value assignments.
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words = words.slice(1)
    // Wrappers like sudo / env / nice.
    while (words.length && WRAPPERS[path.basename(words[0])]) {
      const valueFlags = WRAPPERS[path.basename(words[0])]
      let i = 1
      while (i < words.length && (words[i].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) {
        if (valueFlags.has(words[i])) i++
        i++
      }
      words = words.slice(i)
    }
    if (!words.length) return
    const program = path.basename(words[0])
    if (program === 'cd' || program === 'pushd') {
      const target = words.slice(1).find((w) => !w.startsWith('-'))
      if (target) dir = path.resolve(dir, expandHome(target, home))
      else if (words.length === 1) dir = home
      return
    }
    if (!FILE_COMMANDS.has(program)) return
    const paths: string[] = []
    let afterDashDash = false
    for (const arg of words.slice(1)) {
      if (!afterDashDash && arg === '--') {
        afterDashDash = true
        continue
      }
      if (!afterDashDash && (arg.startsWith('-') || arg.startsWith('+'))) continue
      if (!arg || /^[a-z]+:\/\//i.test(arg)) continue // URLs
      paths.push(path.resolve(dir, expandHome(arg, home)))
    }
    if (paths.length) results.push({ program, paths })
  }

  for (const t of tokens) {
    if (t.op) {
      if (t.value.startsWith('<') || t.value.startsWith('>')) {
        skipNext = true
        continue
      }
      flush()
    } else if (skipNext) {
      skipNext = false
    } else {
      segment.push(t.value)
    }
  }
  flush()
  return results
}

/**
 * Vim keeps a swap file open instead of the file being edited. Map a swap
 * file path back to the edited file, or return null if it isn't one.
 *   /dir/.notes.txt.swp                         -> /dir/notes.txt
 *   ~/.local/state/nvim/swap//%home%me%a.txt.swp -> /home/me/a.txt
 */
export function swapFileTarget(p: string): string | null {
  const base = path.basename(p)
  const central = /^(%.+)\.sw[a-p]$/.exec(base)
  if (central) return central[1].replace(/%/g, '/')
  const local = /^\.(.+)\.sw[a-p]$/.exec(base)
  if (local) return path.join(path.dirname(p), local[1])
  return null
}
