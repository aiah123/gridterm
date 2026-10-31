import { KeyInput, matches, parseAccelerator, ParsedAccelerator } from '../shared/accelerator'
import type { AppCommand } from '../shared/commands'

export interface Binding {
  command: AppCommand
  accelerator: string
  parsed: ParsedAccelerator
}

/** Turn the effective key map into matchable bindings (first wins on clashes). */
export function buildBindings(keys: Partial<Record<AppCommand, string>>, platform: string): Binding[] {
  const out: Binding[] = []
  for (const [command, accelerator] of Object.entries(keys) as [AppCommand, string][]) {
    const parsed = parseAccelerator(accelerator, platform)
    if (parsed) out.push({ command, accelerator, parsed })
  }
  return out
}

/** Return the command bound to an Electron input event, if any. */
export function matchBinding(bindings: Binding[], input: KeyInput & { type: string }): AppCommand | null {
  if (input.type !== 'keyDown') return null
  return bindings.find((b) => matches(b.parsed, input))?.command ?? null
}
