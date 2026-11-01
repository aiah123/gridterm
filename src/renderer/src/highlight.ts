import hljs from 'highlight.js/lib/common'

const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', lua: 'lua', pl: 'perl', r: 'r',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  json: 'json', yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini',
  md: 'markdown', markdown: 'markdown', html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', plist: 'xml',
  css: 'css', scss: 'scss', less: 'less', sql: 'sql', diff: 'diff', patch: 'diff', mk: 'makefile', graphql: 'graphql'
}
const BY_NAME: Record<string, string> = {
  makefile: 'makefile', dockerfile: 'dockerfile', '.bashrc': 'bash', '.zshrc': 'bash', '.profile': 'bash',
  '.bash_profile': 'bash', '.zprofile': 'bash', '.zshenv': 'bash', '.gitconfig': 'ini'
}

/** Highlight.js language for a file path, or null if unknown. */
export function languageFor(path: string, firstLine = ''): string | null {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (BY_NAME[base]) return BY_NAME[base]
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : ''
  const byExt = BY_EXTENSION[ext]
  if (byExt && hljs.getLanguage(byExt)) return byExt
  const shebang = /^#!.*\b(bash|sh|zsh|python3?|node|ruby|perl)\b/.exec(firstLine)
  if (shebang) return { sh: 'bash', zsh: 'bash', bash: 'bash', python: 'python', python3: 'python', node: 'javascript', ruby: 'ruby', perl: 'perl' }[shebang[1]] ?? null
  return null
}

/**
 * Split highlight.js HTML into lines, closing spans at each line end and
 * reopening them on the next line, so every line is well-formed HTML.
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = []
  const open: string[] = [] // opening tags currently in effect
  let current = ''
  const token = /(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+)/g
  let m: RegExpExecArray | null
  while ((m = token.exec(html))) {
    if (m[1]) {
      open.push(m[1])
      current += m[1]
    } else if (m[2]) {
      open.pop()
      current += m[2]
    } else if (m[3]) {
      lines.push(current + '</span>'.repeat(open.length))
      current = open.join('')
    } else {
      current += m[4]
    }
  }
  lines.push(current)
  return lines
}

const MAX_HIGHLIGHT_BYTES = 200_000

/** Highlighted HTML lines for a file, or null to show it as plain text. */
export function highlightLines(path: string, text: string): string[] | null {
  if (text.length > MAX_HIGHLIGHT_BYTES) return null
  const lang = languageFor(path, text.slice(0, text.indexOf('\n') >>> 0))
  if (!lang) return null
  try {
    return splitHighlightedLines(hljs.highlight(text, { language: lang, ignoreIllegals: true }).value)
  } catch {
    return null
  }
}
