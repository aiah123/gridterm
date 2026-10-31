import type { AppCommand } from '../shared/api'

export interface Binding {
  /** Electron accelerator string, also shown in the menu. */
  accelerator: string
  command: AppCommand
}

/**
 * App shortcuts. On Linux they use Ctrl+Shift / Ctrl+Alt / Alt so plain
 * Ctrl+<key> still reaches the shell (Ctrl+C, Ctrl+R, ...).
 */
export function defaultBindings(platform: NodeJS.Platform): Binding[] {
  const mac = platform === 'darwin'
  const mod = mac ? 'Cmd' : 'Ctrl+Shift'
  const navMod = mac ? 'Cmd+Alt' : 'Ctrl+Alt'
  const selectMod = mac ? 'Cmd' : 'Alt'
  const bindings: Binding[] = [
    { accelerator: `${mod}+T`, command: 'new-session' },
    { accelerator: `${mod}+W`, command: 'close-session' },
    { accelerator: `${mod}+R`, command: 'rename-session' },
    { accelerator: `${mod}+Enter`, command: 'toggle-focus' },
    { accelerator: `${navMod}+Left`, command: 'nav-left' },
    { accelerator: `${navMod}+Right`, command: 'nav-right' },
    { accelerator: `${navMod}+Up`, command: 'nav-up' },
    { accelerator: `${navMod}+Down`, command: 'nav-down' }
  ]
  for (let n = 1 as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; n <= 9; n++) {
    bindings.push({ accelerator: `${selectMod}+${n}`, command: `select-${n}` })
  }
  return bindings
}

export interface KeyInput {
  type: string
  code: string
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
}

function keyToCode(key: string): string {
  if (/^[A-Z]$/i.test(key)) return `Key${key.toUpperCase()}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  if (['Left', 'Right', 'Up', 'Down'].includes(key)) return `Arrow${key}`
  return key // Enter, F2, ...
}

/** Return the command bound to a key event, matching modifiers exactly. */
export function matchBinding(bindings: Binding[], input: KeyInput): AppCommand | null {
  if (input.type !== 'keyDown') return null
  for (const b of bindings) {
    const parts = b.accelerator.split('+')
    const key = parts.pop()!
    const mods = new Set(parts.map((p) => p.toLowerCase()))
    const want = {
      control: mods.has('ctrl') || mods.has('control'),
      meta: mods.has('cmd') || mods.has('command') || mods.has('meta'),
      alt: mods.has('alt') || mods.has('option'),
      shift: mods.has('shift')
    }
    const codeOk = input.code === keyToCode(key) || (key.length === 1 && input.code === `Numpad${key}`)
    if (
      codeOk &&
      input.control === want.control &&
      input.meta === want.meta &&
      input.alt === want.alt &&
      input.shift === want.shift
    ) {
      return b.command
    }
  }
  return null
}
