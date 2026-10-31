/** Undo the shell scripts' escaping: \\ \n \e \a */
export function unescapePayload(s: string): string {
  return s.replace(/\\([\\nea])/g, (_, c: string) => ({ '\\': '\\', n: '\n', e: '\x1b', a: '\x07' })[c]!)
}
