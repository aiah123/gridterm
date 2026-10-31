/**
 * Keyboard shortcut strings in Electron accelerator style, e.g. "Ctrl+Shift+T",
 * "Cmd+Alt+Up", "CmdOrCtrl+,". Shared by the main process (matching key
 * events) and the settings screen (recording and display).
 */

export interface Modifiers {
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}

export interface ParsedAccelerator extends Modifiers {
  /** KeyboardEvent.code, e.g. "KeyT", "ArrowUp", "Comma" */
  code: string
}

const PUNCTUATION: Record<string, string> = {
  ',': 'Comma', '.': 'Period', '/': 'Slash', ';': 'Semicolon', "'": 'Quote',
  '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', '`': 'Backquote',
  '-': 'Minus', '=': 'Equal', Plus: 'Equal'
}
const NAMED: Record<string, string> = {
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  enter: 'Enter', return: 'Enter', space: 'Space', tab: 'Tab', backspace: 'Backspace',
  delete: 'Delete', escape: 'Escape', esc: 'Escape', home: 'Home', end: 'End',
  pageup: 'PageUp', pagedown: 'PageDown', insert: 'Insert'
}

function keyToCode(key: string): string | null {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(key)) return key.toUpperCase()
  if (PUNCTUATION[key]) return PUNCTUATION[key]
  return NAMED[key.toLowerCase()] ?? null
}

/** Parse an accelerator, or return null if it isn't valid. */
export function parseAccelerator(accel: string, platform: string): ParsedAccelerator | null {
  if (typeof accel !== 'string' || !accel.trim()) return null
  // Allow "Ctrl++" style for the plus key.
  const parts = accel.trim().replace(/\+\+$/, '+Plus').split('+')
  const key = parts.pop()!
  const code = keyToCode(key)
  if (!code) return null
  const out: ParsedAccelerator = { control: false, meta: false, alt: false, shift: false, code }
  for (const raw of parts) {
    const m = raw.toLowerCase()
    if (m === 'ctrl' || m === 'control') out.control = true
    else if (m === 'cmd' || m === 'command' || m === 'meta' || m === 'super') out.meta = true
    else if (m === 'alt' || m === 'option') out.alt = true
    else if (m === 'shift') out.shift = true
    else if (m === 'cmdorctrl' || m === 'commandorcontrol') {
      if (platform === 'darwin') out.meta = true
      else out.control = true
    } else return null
  }
  return out
}

/** True for shortcuts that would swallow ordinary typing (no modifier, not an F-key). */
export function isBareKey(p: ParsedAccelerator): boolean {
  return !p.control && !p.meta && !p.alt && !/^F\d+$/.test(p.code)
}

export interface KeyInput extends Modifiers {
  code: string
}

export function matches(p: ParsedAccelerator, input: KeyInput): boolean {
  const code = input.code.startsWith('Numpad') && /^Digit/.test(p.code) ? input.code.replace('Numpad', 'Digit') : input.code
  return (
    code === p.code &&
    input.control === p.control &&
    input.meta === p.meta &&
    input.alt === p.alt &&
    input.shift === p.shift
  )
}

const CODE_TO_KEY: Record<string, string> = Object.fromEntries([
  ...Object.entries(PUNCTUATION).filter(([k]) => k !== 'Plus').map(([k, v]) => [v, k]),
  ['ArrowUp', 'Up'], ['ArrowDown', 'Down'], ['ArrowLeft', 'Left'], ['ArrowRight', 'Right'],
  ['Enter', 'Enter'], ['Space', 'Space'], ['Tab', 'Tab'], ['Backspace', 'Backspace'],
  ['Delete', 'Delete'], ['Escape', 'Escape'], ['Home', 'Home'], ['End', 'End'],
  ['PageUp', 'PageUp'], ['PageDown', 'PageDown'], ['Insert', 'Insert']
])

/** Build an accelerator from a key event; null for lone modifier keys or unknown keys. */
export function fromKeyEvent(e: KeyInput, platform: string): string | null {
  let key: string | undefined
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^(Digit|Numpad)[0-9]$/.test(e.code)) key = e.code.slice(-1)
  else if (/^F\d+$/.test(e.code)) key = e.code
  else key = CODE_TO_KEY[e.code]
  if (!key) return null
  const mods: string[] = []
  if (e.meta) mods.push(platform === 'darwin' ? 'Cmd' : 'Super')
  if (e.control) mods.push('Ctrl')
  if (e.alt) mods.push('Alt')
  if (e.shift) mods.push('Shift')
  return [...mods, key].join('+')
}

/** Human-friendly label: "⌘⌥↑" on macOS, "Ctrl+Alt+Up" elsewhere. */
export function displayAccelerator(accel: string, platform: string): string {
  const p = parseAccelerator(accel, platform)
  if (!p) return accel
  const key = (/^Key/.test(p.code) ? p.code.slice(3) : /^Digit/.test(p.code) ? p.code.slice(5) : CODE_TO_KEY[p.code] ?? p.code)
  if (platform === 'darwin') {
    const arrows: Record<string, string> = { Up: '↑', Down: '↓', Left: '←', Right: '→', Enter: '↩', Backspace: '⌫', Escape: '⎋', Tab: '⇥' }
    return (p.control ? '⌃' : '') + (p.alt ? '⌥' : '') + (p.shift ? '⇧' : '') + (p.meta ? '⌘' : '') + (arrows[key] ?? key)
  }
  return [p.meta && 'Super', p.control && 'Ctrl', p.alt && 'Alt', p.shift && 'Shift', key].filter(Boolean).join('+')
}

/** Same shortcut written two ways? */
export function sameAccelerator(a: string, b: string, platform: string): boolean {
  const pa = parseAccelerator(a, platform)
  const pb = parseAccelerator(b, platform)
  return !!pa && !!pb && matches(pa, pb)
}
