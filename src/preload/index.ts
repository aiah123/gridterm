import { contextBridge, ipcRenderer } from 'electron'
import type { AppCommand, GridtermApi, SessionContext } from '../shared/api'
import type { ResolvedConfig } from '../shared/config'

// Output can arrive before the tile has mounted and subscribed (e.g. the first
// prompt), so buffer it per session and replay on subscribe.
const listeners = new Map<number, (data: string) => void>()
const pending = new Map<number, string>()

ipcRenderer.on('pty:data', (_e, id: number, data: string) => {
  const cb = listeners.get(id)
  if (cb) cb(data)
  else pending.set(id, (pending.get(id) ?? '') + data)
})

const api: GridtermApi = {
  platform: process.platform,
  createSession: (opts) => ipcRenderer.invoke('pty:create', opts ?? {}),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.send('pty:kill', id),
  onData(id, cb) {
    listeners.set(id, cb)
    const buffered = pending.get(id)
    if (buffered) {
      pending.delete(id)
      cb(buffered)
    }
    return () => {
      if (listeners.get(id) === cb) listeners.delete(id)
    }
  },
  onExit(cb) {
    const h = (_e: unknown, id: number, code: number) => {
      listeners.delete(id)
      pending.delete(id)
      cb(id, code)
    }
    ipcRenderer.on('pty:exit', h)
    return () => ipcRenderer.removeListener('pty:exit', h)
  },
  onCommand(cb) {
    const h = (_e: unknown, command: AppCommand) => cb(command)
    ipcRenderer.on('app:command', h)
    return () => ipcRenderer.removeListener('app:command', h)
  },
  closeWindow: () => ipcRenderer.send('app:close-window'),
  contextEvent: (id, kind, nonce, payload) => ipcRenderer.send('ctx:event', id, kind, nonce, payload),
  onContext(cb) {
    const h = (_e: unknown, id: number, ctx: SessionContext) => cb(id, ctx)
    ipcRenderer.on('ctx:update', h)
    return () => ipcRenderer.removeListener('ctx:update', h)
  },
  removeFile: (id, p) => ipcRenderer.send('ctx:remove-file', id, p),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  revealFile: (p) => ipcRenderer.send('file:reveal', p),
  getRestore: () => ipcRenderer.invoke('state:get-restore'),
  reportLayout: (list, activeId) => ipcRenderer.send('state:layout', list, activeId),
  openLink: (url) => ipcRenderer.send('link:open', url),
  getConfig: () => ipcRenderer.invoke('config:get'),
  onConfig(cb) {
    const h = (_e: unknown, rc: ResolvedConfig) => cb(rc)
    ipcRenderer.on('config:changed', h)
    return () => ipcRenderer.removeListener('config:changed', h)
  },
  updateConfig: (keyPath, value) => ipcRenderer.invoke('config:update', keyPath, value),
  openConfigFile: () => ipcRenderer.send('config:open-file'),
  importTheme: () => ipcRenderer.invoke('config:import-theme'),
  suspendShortcuts: (suspend) => ipcRenderer.send('keys:suspend', suspend),
  copyText: (text) => ipcRenderer.send('clipboard:write', text),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  pasteNative: () => ipcRenderer.send('edit:paste-native')
}

contextBridge.exposeInMainWorld('gridterm', api)
