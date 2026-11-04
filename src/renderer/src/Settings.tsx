import { useEffect, useRef, useState } from 'react'
import { displayAccelerator, fromKeyEvent, isBareKey, parseAccelerator, sameAccelerator } from '../../shared/accelerator'
import { ALL_COMMANDS, AppCommand, COMMAND_LABELS } from '../../shared/commands'
import { DEFAULTS, RULES, ResolvedConfig } from '../../shared/config'
import type { ThemeColors } from '../../shared/themes'

interface Props {
  rc: ResolvedConfig
  onClose(): void
  onError(message: string): void
}

type Tab = 'appearance' | 'terminal' | 'shortcuts'

export function Settings({ rc, onClose, onError }: Props) {
  const [tab, setTab] = useState<Tab>('appearance')
  const [recording, setRecording] = useState<AppCommand | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const { config } = rc

  useEffect(() => ref.current?.focus(), [])

  // Esc closes, wherever focus is (clicked buttons can disappear and drop focus to <body>).
  useEffect(() => {
    if (recording) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recording, onClose])

  const set = (path: string[], value: unknown) => {
    window.gridterm.updateConfig(path, value).catch((e: Error) => onError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  }
  /** Validate locally with the same rules as the config file before saving. */
  const setChecked = (section: string, field: string, value: unknown): boolean => {
    const rule = RULES[section]?.[field]
    if (rule && !rule[0](value)) {
      onError(`${section}.${field} should be ${rule[1]}.`)
      return false
    }
    set([section, field], value)
    return true
  }

  return (
    <div
      className="settings-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="settings"
        role="dialog"
        aria-label="Settings"
        ref={ref}
        tabIndex={-1}
      >
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="icon-btn" aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="tabs" role="tablist">
          {(['appearance', 'terminal', 'shortcuts'] as Tab[]).map((t) => (
            <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="settings-body">
          {tab === 'appearance' && (
            <>
              <h3>Theme</h3>
              <div className="theme-grid" data-testid="themes">
                {rc.themeNames.map((name) => (
                  <ThemeCard key={name} name={name} colors={rc.themes[name]} selected={config.theme === name} onSelect={() => set(['theme'], name)} />
                ))}
              </div>
              <div className="row">
                <span />
                <div className="control">
                  <button
                    className="btn"
                    onClick={() =>
                      window.gridterm.importTheme().then(
                        (name) => name && set(['theme'], name),
                        (e: Error) => onError(e.message)
                      )
                    }
                  >
                    Import theme…
                  </button>
                  <span className="muted">iTerm2 .itermcolors or Gridterm .json</span>
                </div>
              </div>

              <h3>Font</h3>
              <div className="row">
                <label htmlFor="font-family">Family</label>
                <div className="control">
                  <CommitInput id="font-family" value={config.font.family} onCommit={(v) => setChecked('font', 'family', v)} />
                  {config.font.family !== DEFAULTS.font.family && (
                    <button className="btn" onClick={() => set(['font', 'family'], undefined)}>
                      Default
                    </button>
                  )}
                </div>
              </div>
              <NumberRow label="Size" id="font-size" value={config.font.size} step={1} onCommit={(v) => setChecked('font', 'size', v)} />
              <NumberRow label="Line height" id="line-height" value={config.font.lineHeight} step={0.05} onCommit={(v) => setChecked('font', 'lineHeight', v)} />

              <h3>Cursor</h3>
              <div className="row">
                <label htmlFor="cursor-style">Style</label>
                <div className="control">
                  <select id="cursor-style" value={config.cursor.style} onChange={(e) => set(['cursor', 'style'], e.target.value)}>
                    <option value="block">Block</option>
                    <option value="bar">Bar</option>
                    <option value="underline">Underline</option>
                  </select>
                </div>
              </div>
              <CheckRow label="Blink" id="cursor-blink" checked={config.cursor.blink} onChange={(v) => set(['cursor', 'blink'], v)} />

              <h3>Window</h3>
              <div className="row">
                <label htmlFor="opacity">Opacity</label>
                <div className="control">
                  <input
                    id="opacity"
                    type="range"
                    min={0.3}
                    max={1}
                    step={0.05}
                    value={config.window.opacity}
                    onChange={(e) => set(['window', 'opacity'], Number(e.target.value))}
                  />
                  <span className="value">{Math.round(config.window.opacity * 100)}%</span>
                </div>
                {rc.platform === 'linux' && <span className="hint">Needs a compositing window manager on Linux.</span>}
              </div>
              <NumberRow label="Padding" id="padding" value={config.window.padding} step={1} onCommit={(v) => setChecked('window', 'padding', v)} suffix="px" />
              <NumberRow label="Gap between sessions" id="gap" value={config.window.gap} step={1} onCommit={(v) => setChecked('window', 'gap', v)} suffix="px" />
            </>
          )}

          {tab === 'terminal' && (
            <>
              <h3>Behaviour</h3>
              <NumberRow label="Scrollback lines" id="scrollback" value={config.terminal.scrollback} step={1000} onCommit={(v) => setChecked('terminal', 'scrollback', v)} />
              <CheckRow label="Copy on select" id="copy-on-select" checked={config.terminal.copyOnSelect} onChange={(v) => set(['terminal', 'copyOnSelect'], v)} />
              <div className="row">
                <label htmlFor="bell">Bell</label>
                <div className="control">
                  <select id="bell" value={config.terminal.bell} onChange={(e) => set(['terminal', 'bell'], e.target.value)}>
                    <option value="visual">Flash</option>
                    <option value="sound">Sound and flash</option>
                    <option value="none">Off</option>
                  </select>
                </div>
              </div>
              {rc.platform === 'darwin' && (
                <CheckRow label="Option key as Meta" id="option-meta" checked={config.terminal.optionIsMeta} onChange={(v) => set(['terminal', 'optionIsMeta'], v)} />
              )}

              <h3>Shell</h3>
              <div className="row">
                <label htmlFor="shell-program">Program</label>
                <div className="control">
                  <CommitInput id="shell-program" value={config.shell.program} placeholder="$SHELL" onCommit={(v) => setChecked('shell', 'program', v.trim())} />
                </div>
                <span className="hint">Used for new sessions. Leave empty to use $SHELL.</span>
              </div>
              <CheckRow
                label="Shell integration"
                id="shell-integration"
                checked={config.shell.integration}
                onChange={(v) => set(['shell', 'integration'], v)}
                hint="Tracks the directory, commands and opened files for zsh and bash. Applies to new sessions."
              />
            </>
          )}

          {tab === 'terminal' && (
            <>
              <h3>Privacy</h3>
              <CheckRow
                label="Record commands"
                id="record-commands"
                checked={config.app.recordCommands}
                onChange={(v) => set(['app', 'recordCommands'], v)}
                hint="Show recent commands and save them between launches. Turning this off clears recorded commands from Gridterm's current state."
              />
              <h3>Startup and quit</h3>
              <CheckRow
                label="Reopen sessions"
                id="restore-sessions"
                checked={config.app.restoreSessions}
                onChange={(v) => set(['app', 'restoreSessions'], v)}
                hint="Bring back session names, folders and context on the next launch. Running programs are not restored."
              />
              <CheckRow
                label="Confirm quit"
                id="confirm-quit"
                checked={config.app.confirmQuit}
                onChange={(v) => set(['app', 'confirmQuit'], v)}
                hint="Ask before quitting while a command is still running."
              />
            </>
          )}

          {tab === 'shortcuts' && (
            <ShortcutTable rc={rc} recording={recording} setRecording={setRecording} set={set} />
          )}
        </div>

        <div className="settings-footer">
          <span title={rc.configPath}>Saved to {rc.configPath}</span>
          <span className="spacer" />
          <button className="btn" onClick={() => window.gridterm.openConfigFile()}>
            Open config file
          </button>
        </div>
      </div>
    </div>
  )
}

function ThemeCard({ name, colors, selected, onSelect }: { name: string; colors: ThemeColors; selected: boolean; onSelect(): void }) {
  const swatch = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'] as const
  return (
    <button className="theme-card" aria-pressed={selected} onClick={onSelect} data-theme={name}>
      <div className="theme-sample" style={{ background: colors.background, color: colors.foreground }}>
        <span style={{ color: colors.green }}>~/src</span> <span style={{ color: colors.blue }}>$</span> ls
        <br />
        <span style={{ color: colors.cyan }}>app</span> <span style={{ color: colors.yellow }}>notes.md</span>
      </div>
      <div className="theme-swatches">
        {swatch.map((c) => (
          <span key={c} style={{ background: colors[c] }} />
        ))}
      </div>
      <span className="theme-name">{name}</span>
    </button>
  )
}

/** Text input that saves on Enter or blur. */
function CommitInput({ id, value, placeholder, onCommit }: { id: string; value: string; placeholder?: string; onCommit(v: string): void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return (
    <input
      id={id}
      type="text"
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
}

function NumberRow(props: { label: string; id: string; value: number; step: number; suffix?: string; onCommit(v: number): boolean | void }) {
  const [draft, setDraft] = useState(String(props.value))
  useEffect(() => setDraft(String(props.value)), [props.value])
  const commit = (text: string) => {
    const n = Number(text)
    if (text.trim() === '' || !Number.isFinite(n)) return setDraft(String(props.value))
    if (n !== props.value && props.onCommit(n) === false) setDraft(String(props.value))
  }
  return (
    <div className="row">
      <label htmlFor={props.id}>{props.label}</label>
      <div className="control">
        <input
          id={props.id}
          type="number"
          step={props.step}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            // Spinner clicks commit immediately; typing commits on blur/Enter.
            if (!(e.nativeEvent as InputEvent).inputType) commit(e.target.value)
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
          }}
        />
        {props.suffix && <span className="value">{props.suffix}</span>}
      </div>
    </div>
  )
}

function CheckRow(props: { label: string; id: string; checked: boolean; hint?: string; onChange(v: boolean): void }) {
  return (
    <div className="row">
      <label htmlFor={props.id}>{props.label}</label>
      <div className="control">
        <input id={props.id} type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      </div>
      {props.hint && <span className="hint">{props.hint}</span>}
    </div>
  )
}

function ShortcutTable(props: {
  rc: ResolvedConfig
  recording: AppCommand | null
  setRecording(c: AppCommand | null): void
  set(path: string[], value: unknown): void
}) {
  const { rc, recording, setRecording, set } = props
  const [error, setError] = useState<{ cmd: AppCommand; text: string } | null>(null)

  // While recording, app shortcuts are paused so the keys reach this screen.
  useEffect(() => {
    if (!recording) return
    window.gridterm.suspendShortcuts(true)
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const mods = { control: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey }
      if (e.key === 'Escape' && !mods.control && !mods.meta && !mods.alt && !mods.shift) return setRecording(null)
      const accel = fromKeyEvent({ code: e.code, ...mods }, rc.platform)
      if (!accel) return // modifier on its own; keep waiting
      const parsed = parseAccelerator(accel, rc.platform)!
      if (isBareKey(parsed)) return setError({ cmd: recording, text: 'Add Ctrl, Alt or Cmd so the shortcut doesn’t block typing.' })
      const clash = (Object.entries(rc.keys) as [AppCommand, string][]).find(([c, a]) => c !== recording && sameAccelerator(a, accel, rc.platform))
      if (clash) return setError({ cmd: recording, text: `${displayAccelerator(accel, rc.platform)} is already used by “${COMMAND_LABELS[clash[0]]}”.` })
      setError(null)
      const isDefault = sameAccelerator(rc.defaultKeys[recording], accel, rc.platform)
      set(['keys', recording], isDefault ? undefined : accel)
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.gridterm.suspendShortcuts(false)
    }
  }, [recording, rc, setRecording, set])

  return (
    <>
      <p className="muted" style={{ marginTop: 12 }}>
        Click <strong>Change</strong>, then press the new keys. Esc cancels.
      </p>
      <table className="keys-table" data-testid="shortcuts">
        <tbody>
          {ALL_COMMANDS.map((cmd) => {
            const accel = rc.keys[cmd]
            const overridden = rc.config.keys[cmd] !== undefined
            return (
              <tr key={cmd} data-command={cmd}>
                <td>{COMMAND_LABELS[cmd]}</td>
                <td>
                  {recording === cmd ? (
                    <span className="kbd recording">Press keys…</span>
                  ) : accel ? (
                    <span className="kbd">{displayAccelerator(accel, rc.platform)}</span>
                  ) : (
                    <span className="kbd off">Off</span>
                  )}
                  <button
                    className="btn"
                    onClick={() => {
                      setError(null)
                      setRecording(recording === cmd ? null : cmd)
                    }}
                  >
                    {recording === cmd ? 'Cancel' : 'Change'}
                  </button>
                  {accel && (
                    <button className="btn" onClick={() => set(['keys', cmd], false)}>
                      Turn off
                    </button>
                  )}
                  {overridden && (
                    <button className="btn" onClick={() => set(['keys', cmd], undefined)}>
                      Reset
                    </button>
                  )}
                  {error?.cmd === cmd && <span className="key-error">{error.text}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
