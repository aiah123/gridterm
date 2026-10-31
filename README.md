# Gridterm

A terminal for macOS and Linux that shows all your sessions at once, laid out as an even grid.

## Status
- ✅ M0: Electron + xterm.js + node-pty scaffold
- ✅ M1: even grid layout, new/close session, click to activate, PTY resizing
- ✅ M2: renaming sessions, keyboard navigation
- ✅ M3: focus mode (double-click to enlarge, click outside to exit)
- ✅ M4: zsh/bash shell integration (current directory, commands, exit codes)
- ✅ M5: Context panel (files opened per session, recent commands, file preview)
- ⏳ M6: config file, themes, settings screen

See [PLAN.md](PLAN.md) for the full plan.

## Development
```bash
npm install
npm run dev        # run with hot reload
npm test           # unit tests
npm run build && npm run test:e2e && npm run test:e2e:context   # end-to-end tests (use xvfb-run -a on headless Linux)
npm run typecheck
npm run dist:mac   # or dist:linux
```

## Shortcuts
| Action | macOS | Linux |
|---|---|---|
| New session | Cmd+T | Ctrl+Shift+T |
| Close session | Cmd+W | Ctrl+Shift+W |
| Rename session | Cmd+R | Ctrl+Shift+R |
| Toggle focus mode | Cmd+Enter | Ctrl+Shift+Enter |
| Move between sessions | Cmd+Option+Arrows | Ctrl+Alt+Arrows |
| Jump to session 1–9 | Cmd+1…9 | Alt+1…9 |
| Copy / Paste | Cmd+C / Cmd+V | Ctrl+Shift+C / Ctrl+Shift+V |

Mouse:
- Click a tile to make it active. Only the active tile receives your typing.
- Double-click a title bar to rename that session. Enter saves, Esc cancels.
- Double-click a terminal to enter focus mode. Clicking anywhere outside the focused session exits focus mode; it doesn't change the active session.

History, tab completion and the rest come from your own shell.

## Context panel
In focus mode, the panel next to the session shows:
- **Current directory** (also shown in each tile's title bar).
- **Files** opened in the session. Two sources feed this list:
  - commands such as `vim`, `nvim`, `nano`, `less`, `cat`, `bat`, `tail` and `code`
  - files held open by whatever is running in the session, marked *detected*

  Click a file to preview it. Hover over a file for:
  - **Edit:** types `$EDITOR <file>` into the terminal without running it
  - **Reveal:** shows the file in your file manager
  - **×:** removes it from the list
- **Recent commands** with their exit status. Click one to type it into the terminal again.

This needs Gridterm's shell integration, which loads automatically for zsh and bash. Your own startup files still load first. See [resources/shell-integration](resources/shell-integration/README.md). Other shells still work, but only *detected* files are listed for them.
