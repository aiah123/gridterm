# Gridterm plan

**Platforms:** macOS and Linux.
**Stack:** Electron, TypeScript, Vite, React, xterm.js (WebGL renderer), node-pty.

## Features
- **Grid:** for N sessions, `cols = ceil(sqrt(N))` and `rows = ceil(N/cols)`. A short last row stretches its tiles to fill the width. The active tile gets a highlighted border, and only it receives keyboard input.
- **Names:** each tile has a title bar. To rename, double-click the title bar or press Cmd+R / Ctrl+Shift+R. F2 isn't used, because terminal programs like htop and mc need it. A name you typed always wins over a title set by the shell.
- **Focus mode:** double-click a tile's terminal area, or press Cmd+Enter / Ctrl+Shift+Enter. The session takes about 85% of the window, with a Context panel beside it. Clicking the dimmed backdrop, or pressing the shortcut again, **only exits** focus mode: the active session stays the same. Bare Esc is never used. Cmd/Ctrl+Alt+Arrow swaps the focused session for its neighbour while staying in focus mode.
- **Navigation:** click a tile, use Cmd+Option+Arrow / Ctrl+Alt+Arrow, or press Cmd+1…9 (Alt+1…9 on Linux). Note: GNOME uses Ctrl+Alt+Up/Down to switch workspaces; these shortcuts become remappable in M6.
- **Context panel:** shows the current directory, files opened in the session and recent commands. Sources:
  1. zsh/bash shell integration: hooks report the current directory and each command through escape codes (OSC 7 and an OSC 633-style code). Arguments to editors and pagers are recorded as opened files.
  2. Polling the foreground process's open files (`/proc/<pid>/fd` on Linux, `lsof` on macOS) as a backup.

  Click a file to preview it, or open it in `$EDITOR`.
- **Terminal basics:** history and tab completion come from your shell. xterm.js provides copy/paste, scrollback, search, clickable links, mouse support and the bell.
- **Config:** `~/.config/gridterm/config.toml` (themes, fonts, cursor, opacity, padding, shortcuts) with live reload, plus a settings screen.
- **Persistence:** session names, directories, order and context are restored on launch. Running processes are not.

## Milestones
| # | Milestone |
|---|---|
| M0 ✅ | Scaffold: one xterm connected to node-pty, packaging |
| M1 ✅ | Even grid, new/close session, click to activate, resizing |
| M2 ✅ | Session names and renaming, keyboard navigation |
| M3 ✅ | Focus mode with click outside to exit |
| M4 ✅ | zsh/bash shell integration (injected through a `ZDOTDIR` wrapper / `--rcfile`) |
| M5 ✅ | Context panel and file preview |
| M6 ✅ | Config file, themes, settings screen, remappable shortcuts |
| M7 ✅ | Save and restore sessions; quit confirmation, find, links, syntax highlighting, WebGL cap |
| M8 — skipped | Packaging (`.dmg`, AppImage/deb). Not planned for now: people run Gridterm from source (see README). |

## Security fixes (from the security review)
- **Foreign pages could use Gridterm's API.** Navigation away from the app page is now blocked: links, location changes, dropped files, redirects and iframes. New windows are denied. Every internal message is accepted only from Gridterm's own page.
- **Terminal output could forge shell-integration messages.** Each session gets a random secret that only its shell scripts know; they unset it before your startup files run. Messages without it are ignored, so `cat`, `curl` or `ssh` output can't fake commands, folders or files. Inserting a command or path from the Context panel now always inserts one line without control characters, as a paste, so it can't run anything by itself.
- **Settings updates** accept only known setting names and valid values, so a name like `__proto__` is rejected.
- **Internal messages** are checked against a per-channel type and size table (`src/main/ipcSchema.ts`). A channel without an entry fails at startup.
- **`sandbox`, `contextIsolation`, `nodeIntegration` and `webSecurity`** are now set explicitly.
- **CI** (GitHub Actions) runs the audit and all tests on Linux and macOS.

## Known issues found while building
- In bash, pressing Enter on an empty line recorded Gridterm's own prompt hook as a command. That's fixed.
- `cd dir && vim file` now records `dir/file`. The command parser follows `cd` within a line.
- Copy/paste originally went through the browser's own copy command, which can't see the terminal's selection. It now uses the terminal's selection. The Linux Edit menu also no longer claims Ctrl+A/X/Z, which belong to the shell.
- On Linux, node-pty leaks Electron's open file handles into the shell. Gridterm now starts the shell through a small bash launcher that closes them first; the process ID stays the same. macOS is not affected.

## Risks
- Shortcut conflicts: app shortcuts always use modifier combinations and can be remapped.
- File detection is a heuristic: use both sources, and let the user pin or remove entries.
- macOS `lsof` is slow: run it only for the focused session, and use `libproc` later.
- Browsers limit WebGL contexts (about 16): fall back to the DOM renderer for inactive tiles when there are many.
- Resizing many PTYs at once: debounce resizes, and resize once after animations finish.
