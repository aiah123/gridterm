// End-to-end smoke test (Linux shortcuts). Run: npm run build && npm run test:e2e
// On a headless Linux box: xvfb-run -a node e2e/smoke.cjs
const { _electron } = require('playwright');
const S = process.argv[2]; // optional screenshot dir
const path = require('path');
const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) process.exitCode = 1; };
(async () => {
  const dir = path.resolve(__dirname, '..');
  const app = await _electron.launch({ args: [dir + '/out/main/index.js', '--no-sandbox'], cwd: dir, executablePath: require(path.join(dir, 'node_modules/electron')),
    env: { ...process.env, GRIDTERM_CONFIG_DIR: require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'gt-cfg-')) } });
  const w = await app.firstWindow();
  const cmd = (c) => app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0].webContents.send('app:command', c), c);
  const key = async (accel) => {
    const parts = accel.split('+'); const k = parts.pop();
    const map = { Control: 'control', Shift: 'shift', Alt: 'alt' };
    const keyCode = k.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '');
    await app.evaluate(({ BrowserWindow }, ev) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent(ev), { type: 'keyDown', keyCode, modifiers: parts.map(m => map[m]) });
    await w.waitForTimeout(120);
  };
  const active = () => w.$eval('.tile.active', e => e.dataset.sessionId);
  await w.waitForSelector('.tile');
  for (let i = 0; i < 4; i++) { await key('Control+Shift+KeyT'); await w.waitForTimeout(150); }
  await w.waitForFunction(() => document.querySelectorAll('.tile').length === 5);
  await w.waitForTimeout(800);
  ok('new session is active', await active() === '5');

  // Navigation: 5 tiles = [1][2][3] / [4][5]
  await key('Control+Alt+ArrowUp'); ok('up from 5 -> 3', await active() === '3');
  await key('Control+Alt+ArrowLeft'); ok('left -> 2', await active() === '2');
  await key('Control+Alt+ArrowDown'); ok('down from 2 -> 5', await active() === '5');
  await key('Alt+Digit1'); ok('select-1 -> 1', await active() === '1');
  await key('Alt+Digit9'); ok('select-9 ignored', await active() === '1');

  // Real keyboard accelerator (Ctrl+Alt+Right on Linux)
  await key('Control+Alt+ArrowRight');
  await w.waitForTimeout(200);
  ok('Ctrl+Alt+Right 1 -> 2', await active() === '2');

  // Rename by double-clicking the title bar
  await w.dblclick('.tile[data-session-id="2"] .title');
  await w.waitForSelector('.rename');
  await w.keyboard.press('Control+A');
  await w.keyboard.type('server');
  await w.keyboard.press('Enter');
  ok('rename via double-click', (await w.textContent('.tile[data-session-id="2"] .title')).trim().startsWith('server'));
  ok('renamed tile is active', await active() === '2');
  // Rename via shortcut + Escape cancels
  await key('Control+Shift+KeyR'); await w.waitForSelector('.rename');
  await w.keyboard.type('xxx'); await w.keyboard.press('Escape');
  ok('escape cancels rename', (await w.textContent('.tile[data-session-id="2"] .title')).trim().startsWith('server'));
  // typing goes back to the terminal after rename
  await w.keyboard.type('echo typed-$((2+3))\n'); await w.waitForTimeout(500);
  ok('terminal gets keys after rename', /typed-5/.test(await w.innerText('.tile[data-session-id="2"] .xterm-rows').catch(() => '')));

  // Focus mode by double-clicking the terminal area
  await w.dblclick('.tile[data-session-id="4"] .term');
  await w.waitForSelector('.tile.focused');
  ok('double-click focuses tile 4', await w.$eval('.tile.focused', e => e.dataset.sessionId) === '4');
  ok('context panel shows name', (await w.textContent('.context-panel h2')) === (await w.textContent('.tile.focused .title-text')).split(' — ')[0]);
  const fbox = await w.$eval('.tile.focused', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  console.log('INFO focused size', fbox, 'window', await w.evaluate(() => [innerWidth, innerHeight]));
  await w.waitForTimeout(300);
  if (S) await w.screenshot({ path: S + '/focus.png' });
  await w.keyboard.type('echo focus-$((3*3))\n'); await w.waitForTimeout(500);
  ok('focused terminal gets keys', /focus-9/.test(await w.innerText('.tile.focused .xterm-rows').catch(() => '')));

  // Navigation in focus mode swaps the focused session
  await key('Control+Alt+ArrowRight');
  ok('nav in focus swaps focus to 5', await w.$eval('.tile.focused', e => e.dataset.sessionId) === '5' && await active() === '5');

  // Click outside on top of where tile 1 sits: only exits, active unchanged
  const b1 = await w.$eval('.tile[data-session-id="1"]', e => { const r = e.getBoundingClientRect(); return { x: r.x + 10, y: r.y + 10 }; });
  await w.mouse.click(b1.x, b1.y);
  await w.waitForTimeout(200);
  ok('click outside exits focus', (await w.$('.tile.focused')) === null && (await w.$('.backdrop')) === null);
  ok('active unchanged after exit (5)', await active() === '5');
  await w.keyboard.type('echo after-$((4*4))\n'); await w.waitForTimeout(500);
  ok('keys still go to session 5', /after-16/.test(await w.innerText('.tile[data-session-id="5"] .xterm-rows').catch(() => '')));

  // Toggle via shortcut
  await key('Control+Shift+Enter'); ok('toggle enters', await w.$eval('.tile.focused', e => e.dataset.sessionId) === '5');
  await key('Control+Shift+Enter'); ok('toggle exits', (await w.$('.tile.focused')) === null);
  if (S) await w.screenshot({ path: S + '/grid.png' });
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
