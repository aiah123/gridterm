# Gridterm

A terminal for macOS and Linux that shows all your sessions at once, laid out as an even grid.

## Status
- ✅ M0: Electron + xterm.js + node-pty scaffold
- ✅ M1: even grid layout, new/close session, click to activate, PTY resizing
- ✅ M2: renaming sessions, keyboard navigation
- ✅ M3: focus mode (double-click to enlarge, click outside to exit)
- ⏳ M4–M5: zsh/bash shell integration and the Context panel (files opened per session)

See [PLAN.md](PLAN.md) for the full plan.

## Development
```bash
npm install
npm run dev        # run with hot reload
npm test           # unit tests
npm run build && npm run test:e2e   # end-to-end smoke test (use xvfb-run -a on headless Linux)
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
