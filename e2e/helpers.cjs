// Shared helpers so the end-to-end tests run the same on Linux and macOS.
const fs = require('fs');
const os = require('os');
const path = require('path');

const isMac = process.platform === 'darwin';

/** Linux default shortcuts. On macOS the tests install these too, so one set of keypresses works everywhere. */
const LINUX_KEYS = {
  'new-session': 'Ctrl+Shift+T', 'close-session': 'Ctrl+Shift+W', 'rename-session': 'Ctrl+Shift+R',
  'toggle-focus': 'Ctrl+Shift+Enter', 'open-settings': 'Ctrl+Shift+,', find: 'Ctrl+Shift+F',
  copy: 'Ctrl+Shift+C', paste: 'Ctrl+Shift+V', 'zoom-in': 'Ctrl+Shift+=', 'zoom-out': 'Ctrl+Shift+-', 'zoom-reset': 'Ctrl+Shift+0',
  'nav-left': 'Ctrl+Alt+Left', 'nav-right': 'Ctrl+Alt+Right', 'nav-up': 'Ctrl+Alt+Up', 'nav-down': 'Ctrl+Alt+Down',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`select-${n}`, `Alt+${n}`]))
};

/**
 * On macOS, add the Linux shortcuts to a config file's text (keeping any
 * [keys] the test set itself). On Linux, return the text unchanged.
 */
function withTestKeys(text = '') {
  if (!isMac) return text;
  const lines = Object.entries(LINUX_KEYS)
    .filter(([cmd]) => !new RegExp(`^\\s*"?${cmd.replace(/[-]/g, '\\-')}"?\\s*=`, 'm').test(text))
    .map(([cmd, k]) => `${cmd} = ${JSON.stringify(k)}`)
    .join('\n');
  if (/^\[keys\]\s*$/m.test(text)) return text.replace(/^\[keys\]\s*$/m, `[keys]\n${lines}`);
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}[keys]\n${lines}\n`;
}

/** A fresh config folder for one test run (with test shortcuts on macOS). */
function prepareConfigDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-cfg-'));
  if (isMac) fs.writeFileSync(path.join(dir, 'config.toml'), withTestKeys(''));
  return dir;
}

/** Temp folder with symlinks resolved (macOS: /var -> /private/var), matching what shells and lsof report. */
function realTempDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

/** Modifier for opening links: Cmd on macOS, Ctrl elsewhere. */
const LINK_MODIFIER = isMac ? 'Meta' : 'Control';

/** Quit the app (closing the last window doesn't quit on macOS) and wait for it to exit. */
async function quitApp(app) {
  const exited = new Promise((r) => app.process().once('exit', r));
  await app.evaluate(({ app }) => app.quit());
  await exited;
}

/**
 * Wait until the active session's shell is at its first prompt (shell
 * integration has reported the directory), instead of guessing with a delay.
 */
async function waitForShell(w, timeout = 30000) {
  await w.waitForFunction(() => !!document.querySelector('.tile.active .title .cwd'), null, { timeout });
}

/**
 * Text in a session's terminal buffer (scrollback + screen, wrapped rows joined), read through
 * xterm's API, so it works with both the GPU (canvas) and DOM renderers.
 */
async function screenText(w, tileSelector = '.tile.active') {
  return w.evaluate((sel) => {
    const tile = document.querySelector(sel);
    const term = tile && window.__gridtermTerminals?.get(Number(tile.dataset.sessionId));
    if (!term) return '';
    // Join rows that the terminal wrapped, so each entry is one logical line.
    const buf = term.buffer.active;
    const lines = [];
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i);
      if (!line) continue;
      const text = line.translateToString(true);
      if (line.isWrapped && lines.length) lines[lines.length - 1] += text;
      else lines.push(text);
    }
    return lines.join('\n');
  }, tileSelector);
}

/** Retry a check until it's true or the timeout passes (for slower CI machines). */
async function eventually(check, timeout = 5000, interval = 100) {
  const end = Date.now() + timeout;
  for (;;) {
    try { if (await check()) return true; } catch { /* retry */ }
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, interval));
  }
}

/** Print what the terminals show, to make CI failures readable. */
async function dumpTerminals(w, label = 'terminals') {
  try {
    const ids = await w.$$eval('.tile', (tiles) => tiles.map((t) => [t.dataset.sessionId, t.querySelector('.title')?.textContent ?? '']));
    const parts = [];
    for (const [id, title] of ids) {
      const text = await screenText(w, `.tile[data-session-id="${id}"]`);
      parts.push(`[${title}]\n` + text.split('\n').filter((l) => l.trim()).slice(-15).join('\n'));
    }
    console.log(`INFO ${label}:\n${parts.join('\n---\n')}`);
  } catch (e) {
    console.log(`INFO could not read terminals: ${e.message}`);
  }
}

module.exports = { isMac, LINUX_KEYS, withTestKeys, prepareConfigDir, realTempDir, LINK_MODIFIER, quitApp, waitForShell, dumpTerminals, screenText, eventually };
