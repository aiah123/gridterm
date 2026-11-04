import { app, BrowserWindow, clipboard, dialog, ipcMain, IpcMainEvent, IpcMainInvokeEvent, Menu, MenuItemConstructorOptions, screen, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { promises as fs, statSync } from 'node:fs'
import path from 'node:path'
import { SessionManager } from './sessionManager'
import { Binding, buildBindings, matchBinding } from './keymap'
import { ContextTracker } from './contextTracker'
import { ConfigService } from './configService'
import { SavedState, StateStore, WindowBounds } from './stateStore'
import { isTrustedUrl } from './trust'
import { IPC_SCHEMA, validArgs } from './ipcSchema'
import type { AppCommand, FileReadResult, RestoreInfo } from '../shared/api'
import { COMMAND_LABELS, SELECT_NUMS } from '../shared/commands'
import type { ResolvedConfig } from '../shared/config'

const isMac = process.platform === 'darwin'
let win: BrowserWindow | null = null

// ---- Trust boundary ----
// Only Gridterm's own page may use the internal API (it can start shells and
// type into them), so: never navigate away from it, never open other windows,
// and ignore IPC from anything else.

const APP_URL = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(path.join(__dirname, '../renderer/index.html')).href

app.on('web-contents-created', (_e, contents) => {
  // Covers links, location changes and files dropped onto the window, in any frame.
  contents.on('will-frame-navigate', (event) => {
    if (!isTrustedUrl(event.url, APP_URL)) event.preventDefault()
  })
  contents.on('will-redirect', (event) => {
    if (!isTrustedUrl(event.url, APP_URL)) event.preventDefault()
  })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

function fromApp(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  return !!win && event.sender === win.webContents && !!frame && frame.parent === null && isTrustedUrl(frame.url, APP_URL)
}

function requireSchema(channel: string): void {
  // Every channel must declare its arguments in ipcSchema.ts.
  if (!IPC_SCHEMA[channel]) throw new Error(`IPC channel "${channel}" has no schema`)
}

/** ipcMain.on that ignores messages not sent by Gridterm's own page or with unexpected arguments. */
function on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void): void {
  requireSchema(channel)
  ipcMain.on(channel, (event, ...args) => {
    if (fromApp(event) && validArgs(channel, args)) listener(event, ...args)
  })
}

/** ipcMain.handle that rejects calls not made by Gridterm's own page or with unexpected arguments. */
function handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  requireSchema(channel)
  ipcMain.handle(channel, (event, ...args) => {
    if (!fromApp(event)) throw new Error('Rejected: request did not come from Gridterm.')
    if (!validArgs(channel, args)) throw new Error(`Rejected: invalid arguments for ${channel}.`)
    return listener(event, ...args)
  })
}

const integrationDir = app.isPackaged
  ? path.join(process.resourcesPath, 'shell-integration')
  : path.join(__dirname, '../../resources/shell-integration')

const config = new ConfigService(process.platform, (rc) => applyConfig(rc))

const sessions = new SessionManager(
  {
    onData: (id, data) => win?.webContents.send('pty:data', id, data),
    onExit: (id, code) => {
      tracker.remove(id)
      win?.webContents.send('pty:exit', id, code)
    }
  },
  integrationDir,
  () => config.get().config.shell
)

const tracker = new ContextTracker(
  (id, ctx) => {
    win?.webContents.send('ctx:update', id, ctx)
    scheduleSave()
  },
  () => sessions.list(),
  () => config.get().config.app.recordCommands
)

// ---- Saving and restoring sessions ----

const store = new StateStore(config.dir, () => config.get().config.app.recordCommands)
/** Sessions saved at the last quit; handed to the renderer once. */
let restore: SavedState | null = null
let restoreOffered = false
/** Session names and order as last reported by the renderer. */
let layout: { sessions: { id: number; name: string }[]; activeId: number | null } = { sessions: [], activeId: null }
let saveTimer: NodeJS.Timeout | null = null
/** Set once the window is closing: shells exiting then must not overwrite the saved state. */
let closing = false
let lastBounds: WindowBounds | undefined

function currentState(): SavedState {
  const sessionsOut = layout.sessions.map(({ id, name }) => {
    const ctx = tracker.get(id)
    return { name, cwd: ctx.cwd, files: ctx.files, commands: ctx.commands }
  })
  const activeIndex = Math.max(0, layout.sessions.findIndex((s) => s.id === layout.activeId))
  return { version: 1, sessions: sessionsOut, activeIndex, window: lastBounds }
}

function rememberBounds(): void {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
  const b = win.isMaximized() ? win.getNormalBounds() : win.getBounds()
  lastBounds = { ...b, maximized: win.isMaximized() }
}

function saveNow(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  rememberBounds()
  store.save(currentState())
}

function scheduleSave(): void {
  if (closing) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 1000)
}

/** Saved bounds, if they are still on a connected display. */
function savedBounds(): WindowBounds | undefined {
  const b = restore?.window ?? store.load()?.window
  if (!b) return undefined
  const area = screen.getDisplayMatching(b).workArea
  const visible = b.x < area.x + area.width - 100 && b.x + b.width > area.x + 100 && b.y >= area.y - 10 && b.y < area.y + area.height - 100
  return visible ? b : { ...b, x: area.x + 40, y: area.y + 40, width: Math.min(b.width, area.width - 80), height: Math.min(b.height, area.height - 80) }
}

// ---- Quit confirmation ----

let closeConfirmed = false
let quitRequested = false

async function confirmClose(): Promise<boolean> {
  if (!config.get().config.app.confirmQuit || !win) return true
  const busy = await tracker.busySessions()
  if (!busy.length) return true
  const names = new Map(layout.sessions.map((s) => [s.id, s.name]))
  const lines = busy.map((b) => `• ${names.get(b.id) ?? 'Session'}: ${b.command}`).join('\n')
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Cancel', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    message: busy.length === 1 ? 'A command is still running.' : `${busy.length} commands are still running.`,
    detail: `${lines}\n\nQuitting will stop ${busy.length === 1 ? 'it' : 'them'}. Your sessions' names, folders and context are saved either way.`
  })
  return response === 1
}

const MAX_PREVIEW_BYTES = 512 * 1024

async function readPreview(p: string): Promise<FileReadResult> {
  // Only files that appear in a session's context can be read.
  if (!tracker.isKnownFile(p)) return { ok: false, error: 'File is not in any session context.' }
  try {
    const handle = await fs.open(p, 'r')
    try {
      const { size } = await handle.stat()
      const buf = Buffer.alloc(Math.min(size, MAX_PREVIEW_BYTES))
      await handle.read(buf, 0, buf.length, 0)
      if (buf.subarray(0, 8000).includes(0)) return { ok: false, error: 'Binary file — no preview.' }
      return { ok: true, text: buf.toString('utf8'), truncated: size > buf.length, size }
    } finally {
      await handle.close()
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

function send(command: AppCommand): void {
  win?.webContents.send('app:command', command)
}

let bindings: Binding[] = []
let shortcutsSuspended = false

function applyConfig(rc: ResolvedConfig): void {
  if (!rc.config.app.recordCommands) {
    tracker.clearCommands()
    if (restore) for (const saved of restore.sessions) saved.commands = []
  }
  scheduleSave()
  bindings = buildBindings(rc.keys, process.platform)
  buildMenu(rc)
  win?.setOpacity(rc.config.window.opacity)
  win?.setBackgroundColor(rc.themeColors.background)
  win?.webContents.send('config:changed', rc)
}

/**
 * App shortcuts are matched in `before-input-event` (see createWindow) so they
 * are handled before keys reach the terminal, even with the menu bar hidden.
 * Menu items only display them (registerAccelerator: false) to avoid double firing.
 */
function buildMenu(rc: ResolvedConfig): void {
  const item = (command: AppCommand, label = COMMAND_LABELS[command]): MenuItemConstructorOptions => ({
    label,
    accelerator: rc.keys[command],
    registerAccelerator: false,
    click: () => send(command)
  })
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ label: app.name, submenu: [{ role: 'about' as const }, { type: 'separator' as const }, item('open-settings', 'Settings…'), { type: 'separator' as const }, { role: 'hide' as const }, { role: 'hideOthers' as const }, { type: 'separator' as const }, { role: 'quit' as const }] }]
      : []),
    {
      label: 'Session',
      submenu: [
        item('new-session'),
        item('close-session'),
        item('rename-session'),
        { type: 'separator' },
        item('toggle-focus'),
        ...(isMac ? [] : [{ type: 'separator' as const }, item('open-settings', 'Settings…'), { role: 'quit' as const }])
      ]
    },
    {
      label: 'Edit',
      // Copy/paste go through our commands so they work with the terminal's
      // own selection. No role accelerators on Linux: Ctrl+A/X/Z belong to the shell.
      submenu: [item('copy'), item('paste'), ...(isMac ? [{ role: 'cut' as const }, { role: 'selectAll' as const }, { role: 'undo' as const }, { role: 'redo' as const }] : [])]
    },
    {
      label: 'View',
      submenu: [
        item('zoom-in'),
        item('zoom-out'),
        item('zoom-reset'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        item('nav-left'),
        item('nav-right'),
        item('nav-up'),
        item('nav-down'),
        { type: 'separator' },
        ...SELECT_NUMS.map((n) => item(`select-${n}`))
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  const bounds = savedBounds()
  win = new BrowserWindow({
    width: bounds?.width ?? 1400,
    height: bounds?.height ?? 900,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    backgroundColor: config.get().themeColors.background,
    autoHideMenuBar: true,
    title: 'Gridterm',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // These are Electron's defaults; set explicitly so they can't regress.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })
  win.webContents.on('before-input-event', (event, input) => {
    if (shortcutsSuspended) return
    const command = matchBinding(bindings, input)
    if (command) {
      event.preventDefault()
      send(command)
    }
  })
  win.setOpacity(config.get().config.window.opacity)
  if (bounds?.maximized) win.maximize()
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize'] as const) win.on(ev as 'resize', () => { rememberBounds(); scheduleSave() })
  win.on('close', (event) => {
    if (!closeConfirmed) {
      event.preventDefault()
      void confirmClose().then((ok) => {
        if (!ok) {
          quitRequested = false
          return
        }
        closeConfirmed = true
        if (quitRequested) app.quit()
        else win?.close()
      })
      return
    }
    // Save before the shells are killed; their exits must not empty the saved list.
    saveNow()
    closing = true
  })
  win.on('closed', () => {
    sessions.killAll()
    win = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

handle('pty:create', (_e, opts: { cols?: number; rows?: number; restoreIndex?: number } = {}) => {
  const saved = opts.restoreIndex !== undefined ? restore?.sessions[opts.restoreIndex] : undefined
  let cwd: string | undefined
  if (saved?.cwd) {
    try {
      if (statSync(saved.cwd).isDirectory()) cwd = saved.cwd
    } catch {
      // Folder is gone; start in the home directory.
    }
  }
  const info = sessions.create({ cols: opts.cols, rows: opts.rows, cwd })
  if (saved) tracker.seed(info.id, { cwd: cwd ?? null, files: saved.files, commands: saved.commands })
  return info
})
handle('state:get-restore', (): RestoreInfo | null => {
  if (restoreOffered || !restore?.sessions.length) return null
  restoreOffered = true
  return { sessions: restore.sessions.map((s) => ({ name: s.name })), activeIndex: restore.activeIndex }
})
on('state:layout', (_e, list: { id: number; name: string }[], activeId: number | null) => {
  layout = { sessions: list, activeId }
  scheduleSave()
})
on('link:open', (_e, url: string) => {
  // Only web links; never file:// or custom schemes from terminal output.
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
})
on('pty:write', (_e, id: number, data: string) => sessions.write(id, data))
on('pty:resize', (_e, id: number, cols: number, rows: number) => sessions.resize(id, cols, rows))
on('pty:kill', (_e, id: number) => sessions.kill(id))
on('app:close-window', () => win?.close())
on('ctx:event', (_e, id: number, kind: string, nonce: string, payload: string) => {
  // Drop anything not signed by the session's own shell integration.
  if (sessions.verifyNonce(id, nonce)) void tracker.handleEvent(id, kind, payload)
})
on('ctx:remove-file', (_e, id: number, p: string) => tracker.removeFile(id, p))
handle('file:read', (_e, p: string) => readPreview(p))
on('file:reveal', (_e, p: string) => {
  if (tracker.isKnownFile(p)) shell.showItemInFolder(p)
})
handle('config:get', () => config.get())
handle('config:update', (_e, keyPath: string[], value: unknown) => config.update(keyPath, value))
on('config:open-file', () => void shell.openPath(config.file))
handle('config:import-theme', async () => {
  if (!win) return null
  const res = await dialog.showOpenDialog(win, {
    title: 'Import theme',
    filters: [{ name: 'Themes', extensions: ['itermcolors', 'json'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths[0]) return null
  return config.importTheme(res.filePaths[0])
})
on('keys:suspend', (_e, suspend: boolean) => {
  shortcutsSuspended = suspend
})
on('clipboard:write', async (_e, text: string) => {
  await clipboard.writeText(text)
  // Linux also has the "primary" selection used by middle-click paste.
  if (process.platform === 'linux') await clipboard.selection?.writeText(text).catch(() => {})
})
handle('clipboard:read', () => clipboard.readText())
on('edit:paste-native', () => win?.webContents.paste())

app.on('before-quit', () => {
  quitRequested = true
})

app.whenReady().then(() => {
  const rc = config.init()
  restore = rc.config.app.restoreSessions ? store.load() : null
  bindings = buildBindings(rc.keys, process.platform)
  buildMenu(rc)
  createWindow()
  config.watch()
  tracker.start()
  app.on('activate', () => {
    if (!win) createWindow()
  })
})

app.on('window-all-closed', () => {
  sessions.killAll()
  if (!isMac) app.quit()
})
