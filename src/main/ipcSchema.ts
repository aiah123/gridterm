/**
 * Runtime argument checks for every IPC channel. Messages already come only
 * from Gridterm's own page (see fromApp in index.ts); this is defence in
 * depth so a renderer bug can't hand the main process unexpected types or
 * unbounded sizes.
 */
export type Check = (v: unknown) => boolean

const MiB = 1024 * 1024

export const isId: Check = (v) => Number.isInteger(v) && (v as number) > 0 && (v as number) < 2 ** 31
export const str = (max: number): Check => (v) => typeof v === 'string' && v.length <= max
export const int = (min: number, max: number): Check => (v) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max
export const bool: Check = (v) => typeof v === 'boolean'
export const optional = (c: Check): Check => (v) => v === undefined || c(v)
export const nullable = (c: Check): Check => (v) => v === null || c(v)
export const oneOf = (...xs: string[]): Check => (v) => typeof v === 'string' && xs.includes(v)
export const arrayOf = (c: Check, max: number): Check => (v) => Array.isArray(v) && v.length <= max && v.every(c)
/** A plain object with only these keys (each checked). */
export const shape = (fields: Record<string, Check>): Check => (v) => {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) return false
  const o = v as Record<string, unknown>
  return Object.keys(o).every((k) => Object.prototype.hasOwnProperty.call(fields, k)) && Object.entries(fields).every(([k, c]) => c(o[k]))
}
const settingValue: Check = (v) => v === undefined || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || str(2000)(v)

const path = str(4096)

/** Expected arguments per channel (after the event). */
export const IPC_SCHEMA: Record<string, Check[]> = {
  'pty:create': [optional(shape({ cols: optional(int(1, 2000)), rows: optional(int(1, 1000)), restoreIndex: optional(int(0, 1000)) }))],
  'pty:write': [isId, str(16 * MiB)],
  'pty:resize': [isId, int(1, 2000), int(1, 1000)],
  'pty:kill': [isId],
  'state:get-restore': [],
  'state:layout': [arrayOf(shape({ id: isId, name: str(1000) }), 1000), nullable(isId)],
  'link:open': [str(8192)],
  'app:close-window': [],
  'ctx:event': [isId, oneOf('cwd', 'cmd', 'done'), str(64), str(MiB)],
  'ctx:remove-file': [isId, path],
  'file:read': [path],
  'file:reveal': [path],
  'config:get': [],
  'config:update': [arrayOf(str(100), 3), settingValue],
  'config:open-file': [],
  'config:import-theme': [],
  'keys:suspend': [bool],
  'clipboard:write': [str(16 * MiB)],
  'clipboard:read': [],
  'edit:paste-native': []
}

/** Do these arguments match the channel's schema? Extra arguments are rejected. */
export function validArgs(channel: string, args: unknown[]): boolean {
  const schema = IPC_SCHEMA[channel]
  if (!schema || args.length > schema.length) return false
  return schema.every((check, i) => check(args[i]))
}
