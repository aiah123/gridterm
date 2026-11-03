// End-to-end test for shell integration + Context panel.
// Run: npm run build && node e2e/context.cjs [bash|zsh] [screenshotDir]
// (headless Linux: xvfb-run -a node e2e/context.cjs zsh)
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { prepareConfigDir, realTempDir, waitForShell, dumpTerminals, screenText } = require('./helpers.cjs');
let page = null;
const shellName = process.argv[2] || 'bash';
const S = process.argv[3];
const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + `[${shellName}] ${name}`); if (!cond) process.exitCode = 1; };

(async () => {
  const dir = path.resolve(__dirname, '..');
  const work = realTempDir('gt-e2e-');
  fs.writeFileSync(path.join(work, 'notes.txt'), 'hello\nworld\n');
  fs.writeFileSync(path.join(work, "it's here.md"), '# quoted\n');
  fs.writeFileSync(path.join(work, 'held.txt'), 'held open\n');
  const shellPath = require('child_process').execSync(`command -v ${shellName}`, { shell: '/bin/sh' }).toString().trim();

  const app = await _electron.launch({
    args: [path.join(dir, 'out/main/index.js'), '--no-sandbox'], cwd: dir,
    executablePath: require(path.join(dir, 'node_modules/electron')),
    env: { ...process.env, SHELL: shellPath, GRIDTERM_CONFIG_DIR: prepareConfigDir() }
  });
  const w = await app.firstWindow();
  page = w;
  const key = async (accel) => {
    const parts = accel.split('+'); const k = parts.pop();
    const map = { Control: 'control', Shift: 'shift', Alt: 'alt' };
    await app.evaluate(({ BrowserWindow }, ev) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent(ev), { type: 'keyDown', keyCode: k, modifiers: parts.map(m => map[m]) });
    await w.waitForTimeout(150);
  };
  const run = async (cmd, wait = 700) => { await w.keyboard.type(cmd + '\n'); await w.waitForTimeout(wait); };

  await w.waitForSelector('.tile'); await waitForShell(w);
  await run(`cd '${work}'`);
  ok('title shows cwd', (await w.textContent('.tile.active .title')).includes(path.basename(work)));
  await run('cat notes.txt');
  await run(`less "it's here.md"`, 900); await w.keyboard.type('q'); await w.waitForTimeout(400);
  await run('false');
  await run(''); // Enter on an empty line must not be recorded as a command
  // Not a known command, but holds held.txt open as stdin: found by polling.
  await w.keyboard.type('sleep 6 < held.txt\n');
  await w.waitForTimeout(3500);

  await key('Control+Shift+Enter');
  await w.waitForSelector('.context-panel');
  await w.waitForTimeout(300);
  const files = await w.$$eval('.ctx-file', els => els.map(e => e.getAttribute('title')));
  console.log('INFO files', files);
  ok('cat file listed', files.includes(path.join(work, 'notes.txt')));
  ok('quoted less file listed', files.includes(path.join(work, "it's here.md")));
  ok('held file detected by polling', files.includes(path.join(work, 'held.txt')));
  const detected = await w.$$eval('.ctx-file', els => els.filter(e => e.getAttribute('title').endsWith('held.txt')).map(e => e.textContent));
  ok('held file marked detected', /detected/.test(detected[0] || ''));
  ok('only files from the work dir are listed', files.every(f => f.startsWith(work)));
  if (process.platform === 'linux') {
    const mainPid = await app.evaluate(() => process.pid);
    const shellPid = require('child_process').execSync(`pgrep -P ${mainPid} -n`).toString().trim();
    const fds = fs.readdirSync(`/proc/${shellPid}/fd`).map(fd => { try { return fs.readlinkSync(`/proc/${shellPid}/fd/${fd}`); } catch { return ''; } });
    const leaked = fds.filter(l => l.includes('/.config/') || l.includes('electron') || l.startsWith('socket:'));
    ok('shell has no inherited Electron fds', leaked.length === 0);
    ok('shell stdin/stdout/stderr are the terminal', [0, 1, 2].every(i => fs.readlinkSync(`/proc/${shellPid}/fd/${i}`).startsWith('/dev/pts/')));
    if (leaked.length) console.log('INFO leaked', leaked);
  }
  const cmds = await w.$$eval('.ctx-cmd', els => els.map(e => [e.querySelector('.badge').textContent, e.querySelector('code').textContent]));
  console.log('INFO commands', JSON.stringify(cmds));
  ok('sleep shown running', cmds[0] && cmds[0][1] === 'sleep 6 < held.txt' && cmds[0][0] === '…');
  ok('empty Enter records nothing', cmds.length === 5 && !cmds.some(([, c]) => c.startsWith('__gt')));
  ok('false shows exit 1', cmds.some(([b, c]) => c === 'false' && b === '1'));
  ok('cat shows success', cmds.some(([b, c]) => c === 'cat notes.txt' && b === '✓'));
  ok('panel shows cwd', (await w.textContent('.ctx-cwd')).includes(path.basename(work)));
  if (S) await w.screenshot({ path: `${S}/context-${shellName}.png` });

  await w.waitForTimeout(3000); // let sleep finish
  // Preview
  await w.click(`.ctx-file[title="${path.join(work, 'notes.txt')}"] .ctx-main`);
  await w.waitForSelector('.preview .line');
  ok('preview shows file', (await w.textContent('.preview-body')).includes('world'));
  if (S) await w.screenshot({ path: `${S}/preview-${shellName}.png` });
  await w.keyboard.press('Escape');
  await w.waitForTimeout(200);
  ok('Esc closes preview, focus mode stays', (await w.$('.preview')) === null && (await w.$('.tile.focused')) !== null);
  await run('echo back-$((5*5))', 500);
  ok('terminal has keys after preview', /back-25/.test(await screenText(w, '.tile.focused')));

  // Edit inserts an editor command without running it
  await w.hover(`.ctx-file[title="${path.join(work, "it's here.md")}"]`);
  await w.click(`.ctx-file[title="${path.join(work, "it's here.md")}"] .ctx-actions button:has-text("Edit")`);
  await w.waitForTimeout(400);
  const rows = await screenText(w, '.tile.focused');
  ok('edit inserts quoted command', rows.includes(`\${EDITOR:-vi} '${work}/it'\\''s here.md'`));
  await w.keyboard.press('Control+C'); await w.waitForTimeout(300);

  // Remove
  await w.hover(`.ctx-file[title="${path.join(work, 'held.txt')}"]`);
  await w.click(`.ctx-file[title="${path.join(work, 'held.txt')}"] button[aria-label="Remove"]`);
  await w.waitForTimeout(300);
  ok('remove drops file', !(await w.$$eval('.ctx-file', els => els.map(e => e.getAttribute('title')))).includes(path.join(work, 'held.txt')));

  // Context is per session
  await w.mouse.click(5, 5); // exit focus
  await key('Control+Shift+T'); await waitForShell(w);
  await key('Control+Shift+Enter'); await w.waitForSelector('.context-panel');
  ok('new session has its own empty context', (await w.$$('.ctx-file')).length === 0);
  if (process.exitCode) await dumpTerminals(w);
  await app.close();
  fs.rmSync(work, { recursive: true, force: true });
})().catch(async (e) => { console.error(e); if (page) await dumpTerminals(page); process.exit(1); });
