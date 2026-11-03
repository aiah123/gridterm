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

module.exports = { isMac, LINUX_KEYS, withTestKeys, prepareConfigDir, realTempDir, LINK_MODIFIER, quitApp };
