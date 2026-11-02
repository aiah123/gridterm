/** Undo the shell scripts' escaping: \\ \n \e \a */
export function unescapePayload(s: string): string {
  return s.replace(/\\([\\nea])/g, (_, c: string) => ({ '\\': '\\', n: '\n', e: '\x1b', a: '\x07' })[c]!)
}

/**
 * Parse a shell-integration message body: "<kind>;<nonce>;<payload>".
 * The nonce is checked by the main process, not here.
 */
export function parseIntegrationMessage(data: string): { kind: string; nonce: string; payload: string } | null {
  const a = data.indexOf(';')
  const b = a === -1 ? -1 : data.indexOf(';', a + 1)
  if (a <= 0 || b === -1) return null
  return { kind: data.slice(0, a), nonce: data.slice(a + 1, b), payload: unescapePayload(data.slice(b + 1)) }
}

/**
 * Make text safe to type into a shell: no line breaks or other control
 * characters, so inserting it can never run anything by itself.
 */
export function singleLine(text: string): string {
  return text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .trim()
}
