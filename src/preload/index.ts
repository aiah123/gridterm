import { contextBridge, ipcRenderer } from 'electron'
import type { AppCommand, GridtermApi } from '../shared/api'

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
  closeWindow: () => ipcRenderer.send('app:close-window')
}

contextBridge.exposeInMainWorld('gridterm', api)
