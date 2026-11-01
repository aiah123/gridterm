// End-to-end test for session restore, quit confirmation, find, links and
// syntax highlighting. Launches the app several times with one config dir.
// Run: npm run build && node e2e/restore.cjs [screenshotDir]
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const S = process.argv[2];
const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) process.exitCode = 1; };
const dir = path.resolve(__dirname, '..');
const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-cfg-'));
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gt-work-')));
for (const d of ['alpha', 'beta', 'gone']) fs.mkdirSync(path.join(work, d));
fs.writeFileSync(path.join(work, 'beta', 'app.ts'), 'const answer: number = 42 // the answer\nexport function hi() { return "hi" }\n');

async function launch() {
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
  const run = async (cmd, wait = 600) => { await w.keyboard.type(cmd + '\n'); await w.waitForTimeout(wait); };
  await w.waitForSelector('.tile'); await w.waitForTimeout(1200);
  return { app, w, key, run };
}
const names = (w) => w.$$eval('.tile .title-text', els => els.map(e => e.textContent.split(' — ')[0]));
const activeName = (w) => w.$eval('.tile.active .title-text', e => e.textContent.split(' — ')[0]);
/** Close the window, answering the quit dialog (if any) with `answer`. Returns the dialog message or null. */
async function closeWith(app, answer) {
  await app.evaluate(({ dialog }, answer) => {
    global.__dialogMessages = [];
    dialog.showMessageBox = async (_w, opts) => { global.__dialogMessages.push(`${opts.message} ${opts.detail}`); return { response: answer }; };
  }, answer);
  const closed = new Promise((r) => app.process().once('exit', r));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  if (answer === 1) { await closed; return null; }
  await new Promise((r) => setTimeout(r, 800));
  return app.evaluate(() => global.__dialogMessages);
}

(async () => {
  // ---------- Run 1: set up three sessions ----------
  let { app, w, key, run } = await launch();
  await run(`cd '${work}/alpha'`);
  await key('Control+Shift+T'); await w.waitForTimeout(800);
  await run(`cd '${work}/beta' && cat app.ts`);
  await w.dblclick('.tile.active .title');
  await w.keyboard.press('Control+A'); await w.keyboard.type('api'); await w.keyboard.press('Enter');
  await key('Control+Shift+T'); await w.waitForTimeout(800);
  await run(`cd '${work}/gone'`);
  await key('Alt+2'); // make "api" active
  await app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0]; b.unmaximize(); b.setBounds({ x: 60, y: 50, width: 1000, height: 700 }); });
  await w.waitForTimeout(400);
  ok('quit with idle shells shows no dialog', (await closeWith(app, 1)) === null);
  const state = JSON.parse(fs.readFileSync(path.join(cfgDir, 'state.json'), 'utf8'));
  ok('state saved: names in order', JSON.stringify(state.sessions.map(s => s.name)) === JSON.stringify(['bash 1', 'api', 'bash 3']));
  ok('state saved: folders', state.sessions[1].cwd === `${work}/beta`);
  ok('state saved: active session', state.activeIndex === 1);
  ok('state saved: window bounds', state.window && state.window.width === 1000 && state.window.height === 700);
  fs.rmSync(path.join(work, 'gone'), { recursive: true });

  // ---------- Run 2: restored ----------
  ({ app, w, key, run } = await launch());
  ok('sessions restored with names', JSON.stringify(await names(w)) === JSON.stringify(['bash 1', 'api', 'bash 3']));
  ok('active session restored', await activeName(w) === 'api');
  await run('echo "PWD=$PWD"');
  ok('shell starts in saved folder', (await w.innerText('.tile.active .xterm-rows')).includes(`PWD=${work}/beta`));
  ok('title shows saved folder', (await w.textContent('.tile.active .title')).includes('beta'));
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  ok('window size restored', bounds.width === 1000 && bounds.height === 700);
  await key('Control+Shift+Enter'); await w.waitForSelector('.context-panel');
  const files = await w.$$eval('.ctx-file', els => els.map(e => e.getAttribute('title')));
  const cmds = await w.$$eval('.ctx-cmd code', els => els.map(e => e.textContent));
  ok('context restored: files', files.includes(`${work}/beta/app.ts`));
  ok('context restored: commands', cmds.some(c => c.includes('cat app.ts')));

  // Syntax-highlighted preview
  await w.click(`.ctx-file[title="${work}/beta/app.ts"] .ctx-main`);
  await w.waitForSelector('.preview .line');
  ok('preview is syntax highlighted', (await w.$$('.preview .hljs-keyword')).length > 0 && (await w.$$('.preview .hljs-comment')).length > 0);
  const kwColor = await w.$eval('.preview .hljs-keyword', e => getComputedStyle(e).color);
  ok('highlight uses theme colours', kwColor === 'rgb(188, 63, 188)'); // Gridterm Dark magenta #bc3fbc
  if (S) await w.screenshot({ path: `${S}/preview-highlight.png` });
  await w.keyboard.press('Escape');
  await w.mouse.click(5, 5); // exit focus mode

  // Missing folder falls back to home
  await key('Alt+3'); await run('echo "PWD=$PWD"');
  ok('deleted folder falls back to home', (await w.innerText('.tile.active .xterm-rows')).includes(`PWD=${os.homedir()}`));

  // Find bar
  await key('Alt+1');
  await run("clear; printf 'k%sk\\n' 9 9 9", 700);
  await key('Control+Shift+F');
  await w.waitForSelector('.tile.active .find-bar input');
  await w.keyboard.type('k9k'); await w.waitForTimeout(300);
  ok('find counts matches', (await w.textContent('.tile.active [data-testid="find-count"]')).endsWith('/3'));
  await w.keyboard.press('Enter'); await w.waitForTimeout(150);
  const c1 = await w.textContent('.tile.active [data-testid="find-count"]');
  await w.keyboard.press('Enter'); await w.waitForTimeout(150);
  ok('Enter moves to next match', c1 !== await w.textContent('.tile.active [data-testid="find-count"]'));
  await w.fill('.tile.active .find-bar input', 'nothing-here'); await w.waitForTimeout(250);
  ok('find shows no results', (await w.textContent('.tile.active [data-testid="find-count"]')) === 'No results');
  if (S) await w.screenshot({ path: `${S}/find.png` });
  await w.keyboard.press('Escape'); await w.waitForTimeout(150);
  ok('Esc closes find bar', (await w.$('.find-bar')) === null);
  await run('echo after-find-$((3+4))');
  ok('terminal gets keys after find', (await w.innerText('.tile.active .xterm-rows')).includes('after-find-7'));

  // Links: Ctrl+click opens, plain click doesn't
  await app.evaluate(({ shell }) => { global.__opened = []; shell.openExternal = async (u) => { global.__opened.push(u); }; });
  await run("clear; printf 'https://example.com/docs\\n'", 700);
  const scr = await w.$eval('.tile.active .xterm-screen', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await w.mouse.move(scr.x + 40, scr.y + 8); await w.waitForTimeout(300);
  await w.mouse.click(scr.x + 40, scr.y + 8); await w.waitForTimeout(200);
  ok('plain click does not open link', (await app.evaluate(() => global.__opened)).length === 0);
  await w.keyboard.down('Control'); await w.mouse.move(scr.x + 42, scr.y + 8); await w.waitForTimeout(300);
  await w.mouse.click(scr.x + 42, scr.y + 8); await w.keyboard.up('Control'); await w.waitForTimeout(300);
  ok('Ctrl+click opens link', JSON.stringify(await app.evaluate(() => global.__opened)) === JSON.stringify(['https://example.com/docs']));

  // Quit confirmation while a command runs
  await w.keyboard.type('sleep 30\n'); await w.waitForTimeout(3200); // let the poller notice too
  const msgs = await closeWith(app, 0);
  ok('quit asks while a command runs', msgs.length === 1 && /sleep/.test(msgs[0]) && /bash 1/.test(msgs[0]));
  ok('Cancel keeps the window open', (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1);
  await closeWith(app, 1);
  const state2 = JSON.parse(fs.readFileSync(path.join(cfgDir, 'state.json'), 'utf8'));
  ok('Quit saves state; running command not saved', state2.sessions.length === 3 && !state2.sessions[0].commands.some(c => c.command === 'sleep 30'));

  // ---------- Run 3: restore turned off ----------
  fs.writeFileSync(path.join(cfgDir, 'config.toml'), '[app]\nrestoreSessions = false\n');
  ({ app, w, key, run } = await launch());
  ok('restore off starts one fresh session', JSON.stringify(await names(w)) === JSON.stringify(['bash 1']) && !(await w.textContent('.tile .title')).includes('beta'));
  // Exiting the last shell closes the window and saves an empty list.
  const exited = new Promise((r) => app.process().once('exit', r));
  await w.keyboard.type('exit\n'); await exited;
  ok('last shell exit saves no sessions', JSON.parse(fs.readFileSync(path.join(cfgDir, 'state.json'), 'utf8')).sessions.length === 0);

  fs.rmSync(cfgDir, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
