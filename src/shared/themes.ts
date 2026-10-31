export interface ThemeColors {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  /** UI accent: active tile border, buttons */
  accent: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export const THEME_KEYS = [
  'background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground', 'accent',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
] as const satisfies readonly (keyof ThemeColors)[]

type Ansi = [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]

function theme(base: { bg: string; fg: string; cursor?: string; selection: string; accent: string }, ansi: Ansi): ThemeColors {
  const [black, red, green, yellow, blue, magenta, cyan, white, brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] = ansi
  return {
    background: base.bg, foreground: base.fg, cursor: base.cursor ?? base.fg, cursorAccent: base.bg,
    selectionBackground: base.selection, accent: base.accent,
    black, red, green, yellow, blue, magenta, cyan, white,
    brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite
  }
}

const sol = {
  base03: '#002b36', base02: '#073642', base01: '#586e75', base00: '#657b83',
  base0: '#839496', base1: '#93a1a1', base2: '#eee8d5', base3: '#fdf6e3',
  yellow: '#b58900', orange: '#cb4b16', red: '#dc322f', magenta: '#d33682',
  violet: '#6c71c4', blue: '#268bd2', cyan: '#2aa198', green: '#859900'
}
const solAnsi: Ansi = [sol.base02, sol.red, sol.green, sol.yellow, sol.blue, sol.magenta, sol.cyan, sol.base2,
  sol.base03, sol.orange, sol.base01, sol.base00, sol.base0, sol.violet, sol.base1, sol.base3]

export const DEFAULT_THEME = 'Gridterm Dark'

export const BUILTIN_THEMES: Record<string, ThemeColors> = {
  'Gridterm Dark': theme({ bg: '#1e1e1e', fg: '#d4d4d4', selection: '#264f78', accent: '#3b8eea' },
    ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
     '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff']),
  'Gridterm Light': theme({ bg: '#ffffff', fg: '#333333', selection: '#add6ff', accent: '#0066bf' },
    ['#000000', '#cd3131', '#00bc00', '#949800', '#0451a5', '#bc05bc', '#0598bc', '#555555',
     '#666666', '#cd3131', '#14ce14', '#b5ba00', '#0451a5', '#bc05bc', '#0598bc', '#a5a5a5']),
  'Solarized Dark': theme({ bg: sol.base03, fg: sol.base0, cursor: sol.base1, selection: sol.base02, accent: sol.blue }, solAnsi),
  'Solarized Light': theme({ bg: sol.base3, fg: sol.base00, cursor: sol.base01, selection: sol.base2, accent: sol.blue }, solAnsi),
  Dracula: theme({ bg: '#282a36', fg: '#f8f8f2', selection: '#44475a', accent: '#bd93f9' },
    ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2',
     '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']),
  Nord: theme({ bg: '#2e3440', fg: '#d8dee9', selection: '#434c5e', accent: '#88c0d0' },
    ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0',
     '#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4']),
  'Gruvbox Dark': theme({ bg: '#282828', fg: '#ebdbb2', selection: '#504945', accent: '#83a598' },
    ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984',
     '#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2']),
  'One Dark': theme({ bg: '#282c34', fg: '#abb2bf', cursor: '#528bff', selection: '#3e4451', accent: '#61afef' },
    ['#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf',
     '#5c6370', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#ffffff']),
  'Tokyo Night': theme({ bg: '#1a1b26', fg: '#c0caf5', selection: '#33467c', accent: '#7aa2f7' },
    ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6',
     '#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5'])
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/**
 * Fill in a partial theme over a base theme, keeping only valid colours.
 * Returns the theme and the names of any invalid keys.
 */
export function completeTheme(partial: Record<string, unknown>, base: ThemeColors = BUILTIN_THEMES[DEFAULT_THEME]): { theme: ThemeColors; invalid: string[] } {
  const out = { ...base }
  const invalid: string[] = []
  for (const [k, v] of Object.entries(partial)) {
    if ((THEME_KEYS as readonly string[]).includes(k) && typeof v === 'string' && HEX.test(v)) out[k as keyof ThemeColors] = v
    else invalid.push(k)
  }
  // Derived defaults when a theme only gives the basics.
  if (!('cursorAccent' in partial)) out.cursorAccent = out.background
  if (!('cursor' in partial) && 'foreground' in partial) out.cursor = out.foreground
  if (!('accent' in partial) && 'blue' in partial) out.accent = out.brightBlue ?? out.blue
  return { theme: out, invalid }
}

/** Parse an iTerm2 .itermcolors file (XML plist). */
export function parseItermColors(xml: string): Partial<ThemeColors> {
  const names: Record<string, keyof ThemeColors> = {
    'Background Color': 'background', 'Foreground Color': 'foreground', 'Cursor Color': 'cursor',
    'Cursor Text Color': 'cursorAccent', 'Selection Color': 'selectionBackground'
  }
  const ansi = THEME_KEYS.slice(6)
  const out: Partial<ThemeColors> = {}
  const entry = /<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g
  let m: RegExpExecArray | null
  while ((m = entry.exec(xml))) {
    const name = m[1].trim()
    const ansiMatch = /^Ansi (\d+) Color$/.exec(name)
    const key = ansiMatch ? ansi[Number(ansiMatch[1])] : names[name]
    if (!key) continue
    const comp: Record<string, number> = {}
    const c = /<key>(Red|Green|Blue) Component<\/key>\s*<(?:real|integer)>([^<]+)<\/(?:real|integer)>/g
    let cm: RegExpExecArray | null
    while ((cm = c.exec(m[2]))) comp[cm[1]] = Number(cm[2])
    if (['Red', 'Green', 'Blue'].every((k) => Number.isFinite(comp[k]))) {
      const hex = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
      out[key] = `#${hex(comp.Red)}${hex(comp.Green)}${hex(comp.Blue)}`
    }
  }
  return out
}
