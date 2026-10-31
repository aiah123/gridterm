import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import { SessionManager } from './sessionManager'
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

/**
 * App shortcuts live in the menu so they are handled before keys reach the
 * terminal. On Linux we use Ctrl+Shift so plain Ctrl+<key> still reaches the shell.
 */
function buildMenu(): void {
  const mod = isMac ? 'Cmd' : 'Ctrl+Shift'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Session',
      submenu: [
        { label: 'New Session', accelerator: `${mod}+T`, click: () => send('new-session') },
        { label: 'Close Session', accelerator: `${mod}+W`, click: () => send('close-session') }
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
