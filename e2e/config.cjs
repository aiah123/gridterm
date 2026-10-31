// End-to-end test for config file, live reload, settings screen, shortcuts,
// copy/paste and zoom. Run: npm run build && node e2e/config.cjs [screenshotDir]
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const S = process.argv[2];
const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) process.exitCode = 1; };

(async () => {
  const dir = path.resolve(__dirname, '..');
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-cfg-'));
  const cfgFile = path.join(cfgDir, 'config.toml');
  const app = await _electron.launch({
    args: [path.join(dir, 'out/main/index.js'), '--no-sandbox'], cwd: dir,
    executablePath: require(path.join(dir, 'node_modules/electron')),
    env: { ...process.env, GRIDTERM_CONFIG_DIR: cfgDir, SHELL: '/bin/bash' }
  });
  const w = await app.firstWindow();
  const key = async (accel) => {
    const parts = accel.split('+'); const k = parts.pop();
    const map = { Control: 'control', Shift: 'shift', Alt: 'alt' };
    await app.evaluate(({ BrowserWindow }, ev) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent(ev), { type: 'keyDown', keyCode: k, modifiers: parts.map(m => map[m]) });
    await w.waitForTimeout(150);
  };
  const cssVar = (name) => w.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  const tiles = () => w.$$eval('.tile', els => els.length);
  const write = async (text) => { fs.writeFileSync(cfgFile, text); await w.waitForTimeout(700); };

  await w.waitForSelector('.tile'); await w.waitForTimeout(1200);
  ok('default config file created with header', fs.readFileSync(cfgFile, 'utf8').startsWith('# Gridterm settings'));
  ok('default theme applied', await cssVar('--term-bg') === '#1e1e1e');

  // ---- live reload from the file ----
  await write('theme = "Solarized Light"\n[font]\nsize = 16\n[window]\ngap = 10\n');
  ok('file edit changes theme', await cssVar('--term-bg') === '#fdf6e3');
  ok('file edit changes font size', await w.$eval('.tile', e => e.dataset.fontSize) === '16');
  ok('file edit changes gap', await cssVar('--gap') === '10px');

  // ---- bad values: warning toast, defaults used ----
  await write('[font]\nsize = 500\n[cursor]\nstyle = "box"\n');
  const toast = await w.textContent('[data-testid="toast-config"]').catch(() => '');
  ok('invalid values show a warning', /font\.size should be/.test(toast) && /cursor\.style/.test(toast));
  ok('invalid size falls back to default', await w.$eval('.tile', e => e.dataset.fontSize) === '13');

  // ---- syntax error keeps last good config ----
  await write('theme = "Dracula"\n');
  ok('theme Dracula', await cssVar('--term-bg') === '#282a36');
  await write('theme = "Nord\n');
  ok('syntax error reported with line', /line 1/.test(await w.textContent('[data-testid="toast-config"]').catch(() => '')));
  ok('syntax error keeps previous theme', await cssVar('--term-bg') === '#282a36');

  // ---- remapping shortcuts in the file ----
  await write('[keys]\nnew-session = "Ctrl+Alt+N"\nselect-1 = false\n');
  ok('warnings cleared after fix', (await w.$('[data-testid="toast-config"]')) === null);
  const before = await tiles();
  await key('Control+Shift+T');
  ok('old shortcut no longer works', await tiles() === before);
  await key('Control+Alt+N'); await w.waitForTimeout(600);
  ok('remapped shortcut works', await tiles() === before + 1);
  const active = await w.$eval('.tile.active', e => e.dataset.sessionId);
  await key('Alt+1');
  ok('disabled shortcut does nothing', await w.$eval('.tile.active', e => e.dataset.sessionId) === active);
  await write('');

  // ---- settings screen ----
  await key('Control+Shift+,');
  await w.waitForSelector('.settings');
  ok('settings opens with Ctrl+Shift+,', true);
  await w.click('.theme-card[data-theme="Tokyo Night"]'); await w.waitForTimeout(500);
  ok('theme card applies theme', await cssVar('--term-bg') === '#1a1b26');
  ok('theme saved to file', /theme = "Tokyo Night"/.test(fs.readFileSync(cfgFile, 'utf8')));
  await w.fill('#font-size', '15'); await w.press('#font-size', 'Enter'); await w.waitForTimeout(500);
  ok('font size from settings', await w.$eval('.tile', e => e.dataset.fontSize) === '15' && /size = 15/.test(fs.readFileSync(cfgFile, 'utf8')));
  await w.fill('#font-size', '3'); await w.press('#font-size', 'Enter'); await w.waitForTimeout(300);
  ok('out-of-range size rejected with message', /font\.size should be/.test(await w.textContent('[data-testid="toast-settings"]').catch(() => '')) && /size = 15/.test(fs.readFileSync(cfgFile, 'utf8')));
  await w.click('[data-testid="toast-settings"] .icon-btn');
  await w.selectOption('#cursor-style', 'bar'); await w.waitForTimeout(300);
  ok('cursor style saved', /style = "bar"/.test(fs.readFileSync(cfgFile, 'utf8')));
  if (S) await w.screenshot({ path: `${S}/settings-appearance.png` });

  // Shortcut recording
  await w.click('.tab:has-text("Shortcuts")');
  await w.click('tr[data-command="nav-up"] .btn:has-text("Change")');
  await w.waitForSelector('tr[data-command="nav-up"] .kbd.recording');
  await key('Control+Shift+T'); await w.waitForTimeout(200);
  ok('recording rejects a clash', /already used by “New session”/.test(await w.textContent('tr[data-command="nav-up"]')));
  ok('clash did not open a session', await tiles() === before + 1);
  await key('Control+Shift+K'); await w.waitForTimeout(500);
  ok('recorded shortcut saved', /nav-up = "Ctrl\+Shift\+K"/.test(fs.readFileSync(cfgFile, 'utf8')));
  ok('table shows new shortcut', (await w.textContent('tr[data-command="nav-up"] .kbd')) === 'Ctrl+Shift+K');
  if (S) await w.screenshot({ path: `${S}/settings-shortcuts.png` });
  await w.click('tr[data-command="nav-up"] .btn:has-text("Reset")'); await w.waitForTimeout(400);
  ok('reset removes override', !/nav-up/.test(fs.readFileSync(cfgFile, 'utf8')));
  await w.keyboard.press('Escape'); await w.waitForTimeout(200);
  ok('Esc closes settings', (await w.$('.settings')) === null);

  // ---- terminal still gets keys; copy & paste; zoom ----
  await w.keyboard.type("printf '\\033[2J\\033[Hcopytest\\n'\n"); await w.waitForTimeout(600);
  const box = await w.$eval('.tile.active .xterm-screen', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  // Drag to select (double-click in the grid enters focus mode instead of selecting a word).
  await w.mouse.move(box.x + 2, box.y + 8); await w.mouse.down();
  await w.mouse.move(box.x + 300, box.y + 8, { steps: 5 }); await w.mouse.up(); await w.waitForTimeout(200);
  await key('Control+Shift+C'); await w.waitForTimeout(300);
  ok('copy puts selection on clipboard', (await app.evaluate(({ clipboard }) => clipboard.readText())) === 'copytest');
  await app.evaluate(({ clipboard }) => clipboard.writeText('echo pasted-$((6*7))'));
  await key('Control+Shift+V'); await w.keyboard.press('Enter'); await w.waitForTimeout(600);
  ok('paste types clipboard into terminal', /pasted-42/.test(await w.innerText('.tile.active .xterm-rows')));
  const size0 = Number(await w.$eval('.tile.active', e => e.dataset.fontSize));
  await key('Control+Shift+='); await key('Control+Shift+=');
  ok('zoom in grows active tile only', Number(await w.$eval('.tile.active', e => e.dataset.fontSize)) === size0 + 2 &&
    Number(await w.$eval('.tile:not(.active)', e => e.dataset.fontSize)) === size0);
  await key('Control+Shift+0');
  ok('zoom reset', Number(await w.$eval('.tile.active', e => e.dataset.fontSize)) === size0);

  // ---- bell marks inactive tiles ----
  await w.keyboard.type("sleep 1; printf '\\a'\n");
  await key('Alt+1'); await w.waitForTimeout(1600);
  ok('bell on inactive session shows a dot', (await w.$$('[data-testid="bell-dot"]')).length === 1);

  // ---- shell setting applies to new sessions ----
  await write('[shell]\nprogram = "/bin/sh"\n');
  await key('Control+Shift+T'); await w.waitForTimeout(800);
  ok('new session uses configured shell', /^sh \d/.test((await w.textContent('.tile.active .title-text')).trim()));

  if (S) await w.screenshot({ path: `${S}/themed-grid.png` });
  await app.close();
  fs.rmSync(cfgDir, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
