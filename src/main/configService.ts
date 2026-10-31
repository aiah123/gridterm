import { promises as fs, watch, FSWatcher, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse, stringify, TomlError } from 'smol-toml'
import { DEFAULTS, ResolvedConfig, resolveKeys, validateConfig } from '../shared/config'
import { defaultKeys } from '../shared/commands'
import { BUILTIN_THEMES, completeTheme, DEFAULT_THEME, parseItermColors, ThemeColors } from '../shared/themes'

const HEADER = `# Gridterm settings. Changes apply as soon as you save this file.
# Every setting and its default is listed in docs/config.md:
#   https://github.com/aiah123/gridterm/blob/main/docs/config.md
# The settings screen edits this file too. It keeps your values, but
# rewrites the file, so comments other than this header are removed.
`

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function configDir(): string {
  if (process.env.GRIDTERM_CONFIG_DIR) return process.env.GRIDTERM_CONFIG_DIR
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(base, 'gridterm')
}

/**
 * Loads ~/.config/gridterm/config.toml (plus themes/*.json), validates it,
 * watches for edits and writes changes made in the settings screen.
 */
export class ConfigService {
  readonly dir = configDir()
  readonly file = path.join(this.dir, 'config.toml')
  readonly themesDir = path.join(this.dir, 'themes')
  private current!: ResolvedConfig
  private lastText: string | null = null
  private watcher: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(
    private platform: string,
    private onChange: (rc: ResolvedConfig) => void
  ) {}

  get(): ResolvedConfig {
    return this.current
  }

  /** Load synchronously at startup so the first window already has the right settings. */
  init(): ResolvedConfig {
    try {
      readFileSync(this.file)
    } catch {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.file, HEADER)
    }
    this.current = this.loadSync()
    return this.current
  }

  private loadSync(): ResolvedConfig {
    const warnings: string[] = []
    let raw: unknown = {}
    let text = ''
    try {
      text = readFileSync(this.file, 'utf8')
      raw = parse(text)
    } catch (e) {
      if (e instanceof TomlError) {
        warnings.push(`config.toml line ${e.line}: ${e.message.split('\n')[0]}`)
        // Keep the last good settings rather than resetting everything.
        if (this.current) return { ...this.current, warnings }
      } else if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        warnings.push(`Could not read config.toml: ${(e as Error).message}`)
      }
    }
    this.lastText = text
    const fileThemes = this.loadThemeFiles(warnings)
    const names = [...Object.keys(BUILTIN_THEMES), ...Object.keys(fileThemes)]
    const { config, warnings: w } = validateConfig(raw, this.platform, names)
    warnings.push(...w)

    const themes: Record<string, ThemeColors> = { ...BUILTIN_THEMES, ...fileThemes }
    for (const [name, colors] of Object.entries(config.themes)) {
      const { theme, invalid } = completeTheme(colors)
      if (invalid.length) warnings.push(`themes."${name}": ignored invalid entries ${invalid.join(', ')} (colours look like "#1e1e1e").`)
      themes[name] = theme
    }
    return {
      config,
      themeColors: themes[config.theme] ?? BUILTIN_THEMES[DEFAULT_THEME],
      themeNames: Object.keys(themes),
      themes,
      keys: resolveKeys(config, this.platform),
      defaultKeys: defaultKeys(this.platform),
      warnings,
      configPath: this.file,
      platform: this.platform
    }
  }

  private loadThemeFiles(warnings: string[]): Record<string, ThemeColors> {
    const out: Record<string, ThemeColors> = {}
    let files: string[] = []
    try {
      files = readdirSync(this.themesDir)
    } catch {
      return out
    }
    for (const f of files.filter((f) => f.endsWith('.json')).sort()) {
      try {
        const data = JSON.parse(readFileSync(path.join(this.themesDir, f), 'utf8'))
        if (!isObj(data)) throw new Error('not an object')
        out[f.slice(0, -5)] = completeTheme(data).theme
      } catch (e) {
        warnings.push(`themes/${f}: ${(e as Error).message}`)
      }
    }
    return out
  }

  private reload(): void {
    const next = this.loadSync()
    this.current = next
    this.onChange(next)
  }

  watch(): void {
    if (this.watcher) return
    try {
      // Watch the directory: editors often replace the file instead of writing it.
      this.watcher = watch(this.dir, { recursive: false }, () => this.scheduleReload())
      mkdirSync(this.themesDir, { recursive: true })
      watch(this.themesDir, () => this.scheduleReload())
    } catch {
      // Watching is best effort.
    }
  }

  private scheduleReload(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(async () => {
      const text = await fs.readFile(this.file, 'utf8').catch(() => '')
      if (text === this.lastText && !(await this.themesChanged())) return
      this.reload()
    }, 150)
  }

  private themeStamp = ''
  private async themesChanged(): Promise<boolean> {
    const files = await fs.readdir(this.themesDir).catch(() => [] as string[])
    const stats = await Promise.all(files.map((f) => fs.stat(path.join(this.themesDir, f)).then((s) => `${f}:${s.mtimeMs}`).catch(() => f)))
    const stamp = stats.join('|')
    const changed = stamp !== this.themeStamp
    this.themeStamp = stamp
    return changed
  }

  /** Set one setting (value undefined = back to default) and save the file. */
  async update(keyPath: string[], value: unknown): Promise<void> {
    let raw: Record<string, unknown> = {}
    try {
      raw = parse(await fs.readFile(this.file, 'utf8')) as Record<string, unknown>
    } catch (e) {
      if (e instanceof TomlError) throw new Error(`config.toml has an error on line ${e.line}; fix it before changing settings here.`)
    }
    const defaultValue = keyPath.reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), DEFAULTS)
    let node = raw
    for (const k of keyPath.slice(0, -1)) {
      if (!isObj(node[k])) node[k] = {}
      node = node[k] as Record<string, unknown>
    }
    const last = keyPath[keyPath.length - 1]
    if (value === undefined || (keyPath[0] !== 'keys' && value === defaultValue)) delete node[last]
    else node[last] = value
    // Drop empty tables.
    for (const [k, v] of Object.entries(raw)) if (isObj(v) && Object.keys(v).length === 0) delete raw[k]
    const text = HEADER + '\n' + stringify(raw) + '\n'
    await fs.mkdir(this.dir, { recursive: true })
    await fs.writeFile(this.file, text)
    this.reload()
  }

  /** Import an iTerm2 .itermcolors or a JSON theme into themes/. */
  async importTheme(file: string): Promise<string> {
    const text = await fs.readFile(file, 'utf8')
    let colors: Record<string, unknown>
    if (file.endsWith('.itermcolors')) colors = parseItermColors(text)
    else colors = JSON.parse(text)
    if (!isObj(colors) || !Object.keys(colors).length) throw new Error('No colours found in that file.')
    const { theme } = completeTheme(colors)
    const name = path.basename(file).replace(/\.(itermcolors|json)$/, '')
    await fs.mkdir(this.themesDir, { recursive: true })
    await fs.writeFile(path.join(this.themesDir, `${name}.json`), JSON.stringify(theme, null, 2) + '\n')
    this.reload()
    return name
  }
}
