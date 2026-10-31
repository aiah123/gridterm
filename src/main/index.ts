import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, MenuItemConstructorOptions, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { SessionManager } from './sessionManager'
import { Binding, buildBindings, matchBinding } from './keymap'
import { ContextTracker } from './contextTracker'
import { ConfigService } from './configService'
import type { AppCommand, FileReadResult } from '../shared/api'
import { COMMAND_LABELS, SELECT_NUMS } from '../shared/commands'
import type { ResolvedConfig } from '../shared/config'

const isMac = process.platform === 'darwin'
let win: BrowserWindow | null = null

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
  (id, ctx) => win?.webContents.send('ctx:update', id, ctx),
  () => sessions.list()
)

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
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: config.get().themeColors.background,
    autoHideMenuBar: true,
    title: 'Gridterm',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
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

ipcMain.handle('pty:create', (_e, opts) => sessions.create(opts))
ipcMain.on('pty:write', (_e, id: number, data: string) => sessions.write(id, data))
ipcMain.on('pty:resize', (_e, id: number, cols: number, rows: number) => sessions.resize(id, cols, rows))
ipcMain.on('pty:kill', (_e, id: number) => sessions.kill(id))
ipcMain.on('app:close-window', () => win?.close())
ipcMain.on('ctx:event', (_e, id: number, kind: string, payload: string) => void tracker.handleEvent(id, kind, payload))
ipcMain.on('ctx:remove-file', (_e, id: number, p: string) => tracker.removeFile(id, p))
ipcMain.handle('file:read', (_e, p: string) => readPreview(p))
ipcMain.on('file:reveal', (_e, p: string) => {
  if (tracker.isKnownFile(p)) shell.showItemInFolder(p)
})
ipcMain.handle('config:get', () => config.get())
ipcMain.handle('config:update', (_e, keyPath: string[], value: unknown) => config.update(keyPath, value))
ipcMain.on('config:open-file', () => void shell.openPath(config.file))
ipcMain.handle('config:import-theme', async () => {
  if (!win) return null
  const res = await dialog.showOpenDialog(win, {
    title: 'Import theme',
    filters: [{ name: 'Themes', extensions: ['itermcolors', 'json'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths[0]) return null
  return config.importTheme(res.filePaths[0])
})
ipcMain.on('keys:suspend', (_e, suspend: boolean) => {
  shortcutsSuspended = suspend
})
ipcMain.on('clipboard:write', async (_e, text: string) => {
  await clipboard.writeText(text)
  // Linux also has the "primary" selection used by middle-click paste.
  if (process.platform === 'linux') await clipboard.selection?.writeText(text).catch(() => {})
})
ipcMain.handle('clipboard:read', () => clipboard.readText())
ipcMain.on('edit:paste-native', () => win?.webContents.paste())

app.whenReady().then(() => {
  const rc = config.init()
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
