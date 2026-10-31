import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { SessionManager } from './sessionManager'
import { defaultBindings, matchBinding } from './keymap'
import { ContextTracker } from './contextTracker'
import type { AppCommand, FileReadResult } from '../shared/api'

const isMac = process.platform === 'darwin'
let win: BrowserWindow | null = null

const integrationDir = app.isPackaged
  ? path.join(process.resourcesPath, 'shell-integration')
  : path.join(__dirname, '../../resources/shell-integration')

const sessions = new SessionManager(
  {
    onData: (id, data) => win?.webContents.send('pty:data', id, data),
    onExit: (id, code) => {
      tracker.remove(id)
      win?.webContents.send('pty:exit', id, code)
    }
  },
  integrationDir
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

const bindings = defaultBindings(process.platform)
const acceleratorFor = (command: AppCommand) => bindings.find((b) => b.command === command)?.accelerator

/**
 * App shortcuts are matched in `before-input-event` (see createWindow) so they
 * are handled before keys reach the terminal, even with the menu bar hidden.
 * Menu items only display them (registerAccelerator: false) to avoid double firing.
 */
function item(label: string, command: AppCommand): MenuItemConstructorOptions {
  return { label, accelerator: acceleratorFor(command), registerAccelerator: false, click: () => send(command) }
}

function buildMenu(): void {
  const mod = isMac ? 'Cmd' : 'Ctrl+Shift'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Session',
      submenu: [
        item('New Session', 'new-session'),
        item('Close Session', 'close-session'),
        item('Rename Session', 'rename-session'),
        { type: 'separator' },
        item('Toggle Focus Mode', 'toggle-focus')
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        item('Move Left', 'nav-left'),
        item('Move Right', 'nav-right'),
        item('Move Up', 'nav-up'),
        item('Move Down', 'nav-down'),
        { type: 'separator' },
        ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => item(`Session ${n}`, `select-${n}`))
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'copy', accelerator: `${mod}+C` },
        { role: 'paste', accelerator: `${mod}+V` },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1e1e1e',
    autoHideMenuBar: true,
    title: 'Gridterm',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.webContents.on('before-input-event', (event, input) => {
    const command = matchBinding(bindings, input)
    if (command) {
      event.preventDefault()
      send(command)
    }
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

app.whenReady().then(() => {
  buildMenu()
  createWindow()
  tracker.start()
  app.on('activate', () => {
    if (!win) createWindow()
  })
})

app.on('window-all-closed', () => {
  sessions.killAll()
  if (!isMac) app.quit()
})
