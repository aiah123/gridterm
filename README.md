# Gridterm

A terminal for macOS and Linux that shows all your sessions at once, laid out as an even grid.

## Status
- ✅ M0: Electron + xterm.js + node-pty scaffold
- ✅ M1: even grid layout, new/close session, click to activate, PTY resizing
- ⏳ M2: renaming sessions, keyboard navigation
- ⏳ M3: focus mode (double-click to enlarge, click outside to exit)
- ⏳ M4–M5: zsh/bash shell integration and the Context panel (files opened per session)

See [PLAN.md](PLAN.md) for the full plan.

## Development
```bash
npm install
npm run dev        # run with hot reload
npm test           # unit tests
npm run typecheck
npm run dist:mac   # or dist:linux
```

## Shortcuts
| Action | macOS | Linux |
|---|---|---|
| New session | Cmd+T | Ctrl+Shift+T |
| Close session | Cmd+W | Ctrl+Shift+W |
| Copy / Paste | Cmd+C / Cmd+V | Ctrl+Shift+C / Ctrl+Shift+V |

Click a tile to make it active. History, tab completion and the rest come from your own shell.
