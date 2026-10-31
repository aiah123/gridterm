import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import { SessionManager } from './sessionManager'
import { defaultBindings, matchBinding } from './keymap'
import type { AppCommand } from '../shared/api'

const isMac = process.platform === 'darwin'
let win: BrowserWindow | null = null

const sessions = new SessionManager({
  onData: (id, data) => win?.webContents.send('pty:data', id, data),
  onExit: (id, code) => win?.webContents.send('pty:exit', id, code)
})

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

app.whenReady().then(() => {
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (!win) createWindow()
  })
})

app.on('window-all-closed', () => {
  sessions.killAll()
  if (!isMac) app.quit()
})
