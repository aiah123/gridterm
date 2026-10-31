export const NAV_DIRS = ['left', 'right', 'up', 'down'] as const
export const SELECT_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

export type AppCommand =
  | 'new-session'
  | 'close-session'
  | 'rename-session'
  | 'toggle-focus'
  | 'open-settings'
  | 'copy'
  | 'paste'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | `nav-${(typeof NAV_DIRS)[number]}`
  | `select-${(typeof SELECT_NUMS)[number]}`

export const COMMAND_LABELS: Record<AppCommand, string> = {
  'new-session': 'New session',
  'close-session': 'Close session',
  'rename-session': 'Rename session',
  'toggle-focus': 'Toggle focus mode',
  'open-settings': 'Settings',
  copy: 'Copy',
  paste: 'Paste',
  'zoom-in': 'Bigger text',
  'zoom-out': 'Smaller text',
  'zoom-reset': 'Reset text size',
  'nav-left': 'Move left',
  'nav-right': 'Move right',
  'nav-up': 'Move up',
  'nav-down': 'Move down',
  'select-1': 'Go to session 1',
  'select-2': 'Go to session 2',
  'select-3': 'Go to session 3',
  'select-4': 'Go to session 4',
  'select-5': 'Go to session 5',
  'select-6': 'Go to session 6',
  'select-7': 'Go to session 7',
  'select-8': 'Go to session 8',
  'select-9': 'Go to session 9'
}

export const ALL_COMMANDS = Object.keys(COMMAND_LABELS) as AppCommand[]

export function isCommand(s: string): s is AppCommand {
  return s in COMMAND_LABELS
}

/**
 * Default shortcuts. On Linux, app shortcuts use Ctrl+Shift (or Ctrl+Alt / Alt)
 * so plain Ctrl+<key> always reaches the shell (Ctrl+C, Ctrl+R, Ctrl+A, ...).
 */
export function defaultKeys(platform: string): Record<AppCommand, string> {
  const mac = platform === 'darwin'
  const mod = mac ? 'Cmd' : 'Ctrl+Shift'
  const navMod = mac ? 'Cmd+Alt' : 'Ctrl+Alt'
  const selectMod = mac ? 'Cmd' : 'Alt'
  const keys = {
    'new-session': `${mod}+T`,
    'close-session': `${mod}+W`,
    'rename-session': `${mod}+R`,
    'toggle-focus': `${mod}+Enter`,
    'open-settings': `${mod}+,`,
    copy: `${mod}+C`,
    paste: `${mod}+V`,
    'zoom-in': `${mod}+=`,
    'zoom-out': `${mod}+-`,
    'zoom-reset': `${mod}+0`
  } as Record<AppCommand, string>
  for (const d of NAV_DIRS) keys[`nav-${d}`] = `${navMod}+${d[0].toUpperCase()}${d.slice(1)}`
  for (const n of SELECT_NUMS) keys[`select-${n}`] = `${selectMod}+${n}`
  return keys
}
