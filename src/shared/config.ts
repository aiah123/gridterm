import { parseAccelerator, isBareKey } from './accelerator'
import { ALL_COMMANDS, AppCommand, defaultKeys, isCommand } from './commands'
import { DEFAULT_THEME, ThemeColors } from './themes'

export type CursorStyle = 'block' | 'underline' | 'bar'
export type BellMode = 'visual' | 'sound' | 'none'

export interface Config {
  theme: string
  font: { family: string; size: number; lineHeight: number }
  cursor: { style: CursorStyle; blink: boolean }
  terminal: { scrollback: number; copyOnSelect: boolean; bell: BellMode; optionIsMeta: boolean }
  window: { opacity: number; padding: number; gap: number }
  shell: { program: string; integration: boolean }
  app: { restoreSessions: boolean; confirmQuit: boolean }
  /** Shortcut overrides; false disables a shortcut. */
  keys: Partial<Record<AppCommand, string | false>>
  /** Custom themes defined inline: [themes."My Theme"] background = "#..." */
  themes: Record<string, Record<string, string>>
}

export const DEFAULT_FONT = 'Menlo, "SF Mono", "DejaVu Sans Mono", "Liberation Mono", monospace'

export const DEFAULTS: Config = {
  theme: DEFAULT_THEME,
  font: { family: DEFAULT_FONT, size: 13, lineHeight: 1.0 },
  cursor: { style: 'block', blink: true },
  terminal: { scrollback: 10000, copyOnSelect: false, bell: 'visual', optionIsMeta: true },
  window: { opacity: 1, padding: 6, gap: 4 },
  shell: { program: '', integration: true },
  app: { restoreSessions: true, confirmQuit: true },
  keys: {},
  themes: {}
}

type Check = (v: unknown) => boolean
const num = (min: number, max: number): Check => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const int = (min: number, max: number): Check => (v) => Number.isInteger(v) && num(min, max)(v)
const oneOf = (...xs: string[]): Check => (v) => typeof v === 'string' && xs.includes(v)
const str: Check = (v) => typeof v === 'string'
const bool: Check = (v) => typeof v === 'boolean'

/** Validation for every scalar setting, with a hint used in warnings. */
export const RULES: Record<string, Record<string, [Check, string]>> = {
  font: { family: [(v) => str(v) && !!(v as string).trim(), 'a font name'], size: [num(6, 72), 'a number from 6 to 72'], lineHeight: [num(0.8, 3), 'a number from 0.8 to 3'] },
  cursor: { style: [oneOf('block', 'underline', 'bar'), '"block", "underline" or "bar"'], blink: [bool, 'true or false'] },
  terminal: {
    scrollback: [int(0, 1_000_000), 'a whole number from 0 to 1000000'],
    copyOnSelect: [bool, 'true or false'],
    bell: [oneOf('visual', 'sound', 'none'), '"visual", "sound" or "none"'],
    optionIsMeta: [bool, 'true or false']
  },
  window: { opacity: [num(0.3, 1), 'a number from 0.3 to 1'], padding: [int(0, 40), 'a whole number from 0 to 40'], gap: [int(0, 40), 'a whole number from 0 to 40'] },
  shell: { program: [str, 'a path to a shell, or "" for $SHELL'], integration: [bool, 'true or false'] },
  app: { restoreSessions: [bool, 'true or false'], confirmQuit: [bool, 'true or false'] }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Merge a parsed config file over the defaults. Invalid values fall back to
 * the default and produce a warning, so a typo never stops the app.
 */
export function validateConfig(raw: unknown, platform: string, themeNames: string[]): { config: Config; warnings: string[] } {
  const warnings: string[] = []
  const config: Config = structuredClone(DEFAULTS)
  if (!isObj(raw)) return { config, warnings }

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'theme') {
      if (typeof value === 'string') config.theme = value
      else warnings.push('theme should be a theme name.')
    } else if (key === 'keys') {
      if (!isObj(value)) { warnings.push('[keys] should be a table.'); continue }
      const used = new Map<string, string>()
      for (const [cmd, accel] of Object.entries(value)) {
        if (!isCommand(cmd)) { warnings.push(`keys.${cmd}: unknown command. Known: ${ALL_COMMANDS.join(', ')}.`); continue }
        if (accel === false) { config.keys[cmd] = false; continue }
        const parsed = typeof accel === 'string' ? parseAccelerator(accel, platform) : null
        if (!parsed) { warnings.push(`keys.${cmd}: "${String(accel)}" is not a valid shortcut (example: "Ctrl+Shift+T").`); continue }
        if (isBareKey(parsed)) { warnings.push(`keys.${cmd}: "${accel}" needs a modifier key (Ctrl, Alt, Cmd) so it doesn't block typing.`); continue }
        config.keys[cmd] = accel as string
      }
      // Report clashes between the effective shortcuts.
      for (const [cmd, accel] of Object.entries(resolveKeys(config, platform))) {
        const p = parseAccelerator(accel, platform)!
        const id = JSON.stringify(p)
        if (used.has(id)) warnings.push(`keys: "${accel}" is used by both ${used.get(id)} and ${cmd}; ${used.get(id)} wins.`)
        else used.set(id, cmd)
      }
    } else if (key === 'themes') {
      if (!isObj(value)) { warnings.push('[themes] should be a table of themes.'); continue }
      for (const [name, colors] of Object.entries(value)) {
        if (isObj(colors)) config.themes[name] = colors as Record<string, string>
        else warnings.push(`themes.${name} should be a table of colours.`)
      }
    } else if (RULES[key]) {
      if (!isObj(value)) { warnings.push(`[${key}] should be a table.`); continue }
      const section = config[key as keyof Config] as Record<string, unknown>
      for (const [field, v] of Object.entries(value)) {
        const rule = RULES[key][field]
        if (!rule) warnings.push(`${key}.${field}: unknown setting.`)
        else if (rule[0](v)) section[field] = v
        else warnings.push(`${key}.${field} should be ${rule[1]}; using the default.`)
      }
    } else {
      warnings.push(`${key}: unknown setting.`)
    }
  }

  const allThemes = new Set([...themeNames, ...Object.keys(config.themes)])
  if (!allThemes.has(config.theme)) {
    warnings.push(`theme "${config.theme}" not found; using "${DEFAULT_THEME}". Available: ${[...allThemes].join(', ')}.`)
    config.theme = DEFAULT_THEME
  }
  return { config, warnings }
}

/** Effective shortcut for each command (defaults + overrides, minus disabled). */
export function resolveKeys(config: Pick<Config, 'keys'>, platform: string): Partial<Record<AppCommand, string>> {
  const keys: Partial<Record<AppCommand, string>> = defaultKeys(platform)
  for (const [cmd, accel] of Object.entries(config.keys) as [AppCommand, string | false][]) {
    if (accel === false) delete keys[cmd]
    else keys[cmd] = accel
  }
  return keys
}

/** Everything the renderer needs, sent on start and on every change. */
export interface ResolvedConfig {
  config: Config
  themeColors: ThemeColors
  themeNames: string[]
  themes: Record<string, ThemeColors>
  keys: Partial<Record<AppCommand, string>>
  defaultKeys: Record<AppCommand, string>
  warnings: string[]
  configPath: string
  platform: string
}

/**
 * Check a settings-screen update before it touches the config file. Only
 * known settings are allowed (so names like "__proto__" can never be used as
 * keys), and values must pass the same rules as the file. `undefined` resets
 * a setting to its default. Returns an error message, or null if allowed.
 */
export function validateUpdate(keyPath: unknown, value: unknown, platform: string): string | null {
  if (!Array.isArray(keyPath) || !keyPath.every((k) => typeof k === 'string')) return 'Invalid setting path.'
  const [section, field, ...rest] = keyPath as string[]
  if (rest.length) return `Unknown setting: ${keyPath.join('.')}`
  if (section === 'theme' && field === undefined) {
    return value === undefined || (typeof value === 'string' && value.length <= 200) ? null : 'theme should be a theme name.'
  }
  if (section === 'keys' && typeof field === 'string' && isCommand(field)) {
    if (value === undefined || value === false) return null
    const parsed = typeof value === 'string' ? parseAccelerator(value, platform) : null
    if (!parsed) return `keys.${field}: not a valid shortcut.`
    return isBareKey(parsed) ? `keys.${field}: needs a modifier key.` : null
  }
  const rule = Object.prototype.hasOwnProperty.call(RULES, section) && typeof field === 'string' && Object.prototype.hasOwnProperty.call(RULES[section], field) ? RULES[section][field] : undefined
  if (!rule) return `Unknown setting: ${keyPath.join('.')}`
  if (value === undefined || rule[0](value)) return null
  return `${section}.${field} should be ${rule[1]}.`
}
