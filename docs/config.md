# Configuration

Gridterm reads `~/.config/gridterm/config.toml`, or `$XDG_CONFIG_HOME/gridterm/config.toml` if `XDG_CONFIG_HOME` is set. Set `GRIDTERM_CONFIG_DIR` to use a different folder.

- **Live reload:** changes apply as soon as you save the file. No restart is needed.
- **Settings screen:** open it with Cmd+, (macOS) or Ctrl+Shift+, (Linux). It edits the same file. It keeps your values but rewrites the file, so comments other than the header are removed.
- **Mistakes don't stop the app:** an invalid value falls back to its default, and Gridterm shows a warning that names the setting. If the file has a syntax error, Gridterm keeps the last working settings and shows the line number.

Only set what you want to change. Everything has a default.

## Example

```toml
theme = "Tokyo Night"

[font]
family = "JetBrains Mono, monospace"
size = 14
lineHeight = 1.1

[cursor]
style = "bar"        # "block", "bar" or "underline"
blink = false

[terminal]
scrollback = 20000
copyOnSelect = true
bell = "sound"       # "visual", "sound" or "none"

[window]
opacity = 0.95
padding = 8
gap = 6

[shell]
program = "/opt/homebrew/bin/zsh"
integration = true

[app]
restoreSessions = true
confirmQuit = true

[keys]
nav-up = "Ctrl+Shift+Up"      # e.g. to avoid GNOME's Ctrl+Alt+Up
nav-down = "Ctrl+Shift+Down"
select-9 = false              # turn a shortcut off
```

## Settings

| Setting | Default | Allowed |
|---|---|---|
| `theme` | `"Gridterm Dark"` | A built-in, imported or custom theme name |
| `font.family` | `Menlo, "SF Mono", "DejaVu Sans Mono", "Liberation Mono", monospace` | CSS font list |
| `font.size` | `13` | 6–72 |
| `font.lineHeight` | `1.0` | 0.8–3 |
| `cursor.style` | `"block"` | `"block"`, `"bar"`, `"underline"` |
| `cursor.blink` | `true` | `true` / `false` |
| `terminal.scrollback` | `10000` | 0–1000000 lines |
| `terminal.copyOnSelect` | `false` | Copy as soon as text is selected. On Linux this also sets the middle-click selection. |
| `terminal.bell` | `"visual"` | `"visual"` flashes the session, `"sound"` also beeps, `"none"` does nothing. A bell in an inactive session also puts a dot in its title. |
| `terminal.optionIsMeta` | `true` | macOS only: the Option key acts as Meta |
| `window.opacity` | `1` | 0.3–1. Linux needs a compositing window manager. |
| `window.padding` | `6` | 0–40 px inside each session |
| `window.gap` | `4` | 0–40 px between sessions |
| `shell.program` | `""` | Path to a shell. `""` uses `$SHELL`. Applies to new sessions. |
| `shell.integration` | `true` | Directory, command and file tracking for zsh and bash. Applies to new sessions. |
| `app.restoreSessions` | `true` | Reopen the last sessions (names, folders, context) and the window size on launch. Saved in `state.json` next to `config.toml`. |
| `app.confirmQuit` | `true` | Ask before quitting while a command is running |

## Themes

Built-in themes:
- Gridterm Dark
- Gridterm Light
- Solarized Dark
- Solarized Light
- Dracula
- Nord
- Gruvbox Dark
- One Dark
- Tokyo Night

You can add your own in three ways:

- **Inline in config.toml.** Anything you leave out comes from Gridterm Dark.
  ```toml
  theme = "Mine"
  [themes.Mine]
  background = "#101418"
  foreground = "#e0e6ee"
  accent = "#ff9e3b"   # active border and buttons
  red = "#ff5f59"
  ```
- **Import from the settings screen.** Use **Import theme…** to pick an iTerm2 `.itermcolors` file or a Gridterm `.json` file. It's copied into `~/.config/gridterm/themes/`.
- **Add a JSON file yourself.** Put `<name>.json` in `~/.config/gridterm/themes/`, using the same keys as an inline theme.

Colour keys:
- `background`, `foreground`, `cursor`, `cursorAccent`, `selectionBackground`, `accent`
- `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`
- the `bright…` version of each of those eight

Colours are hex values, such as `"#1e1e1e"`.

## Shortcuts

Shortcuts use Electron's accelerator style:
- **Modifiers:** `Ctrl`, `Alt`/`Option`, `Shift`, `Cmd` (macOS), `Super` (Linux) and `CmdOrCtrl`.
- **Keys:** letters, digits, `F1`–`F24`, `Up`/`Down`/`Left`/`Right`, `Enter`, `Space`, `Tab`, `Backspace`, `Delete`, `Escape`, `Home`, `End`, `PageUp`, `PageDown` and `, . / ; ' [ ] \ ` - =`.

Every shortcut needs a modifier (F-keys don't), so it can't block normal typing. Set a shortcut to `false` to turn it off.

| Command | macOS | Linux |
|---|---|---|
| `new-session` | Cmd+T | Ctrl+Shift+T |
| `close-session` | Cmd+W | Ctrl+Shift+W |
| `rename-session` | Cmd+R | Ctrl+Shift+R |
| `toggle-focus` | Cmd+Enter | Ctrl+Shift+Enter |
| `open-settings` | Cmd+, | Ctrl+Shift+, |
| `find` | Cmd+F | Ctrl+Shift+F |
| `copy` / `paste` | Cmd+C / Cmd+V | Ctrl+Shift+C / Ctrl+Shift+V |
| `zoom-in` / `zoom-out` / `zoom-reset` | Cmd+= / Cmd+- / Cmd+0 | Ctrl+Shift+= / Ctrl+Shift+- / Ctrl+Shift+0 |
| `nav-left` / `nav-right` / `nav-up` / `nav-down` | Cmd+Option+Arrows | Ctrl+Alt+Arrows |
| `select-1` … `select-9` | Cmd+1 … Cmd+9 | Alt+1 … Alt+9 |

Zoom changes the text size of the active session only, and isn't saved.
