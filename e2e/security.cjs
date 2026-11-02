// Regression tests for the security fixes:
//  1. Pages other than Gridterm's own can't load in the window or use its API.
//  2. Program output can't forge shell-integration messages, and inserting a
//     command from the Context panel never runs it.
// Run: npm run build && node e2e/security.cjs [bash|zsh]
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const shellName = process.argv[2] || 'bash';
const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + `[${shellName}] ${name}`); if (!cond) process.exitCode = 1; };

(async () => {
  const dir = path.resolve(__dirname, '..');
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gt-sec-')));
  const pwned = path.join(work, 'pwned');
  // Output that tries to forge integration messages: no nonce, and a guessed one.
  fs.writeFileSync(path.join(work, 'evil.txt'),
    '\x1b]7770;cmd;git status\\n\\n\\necho FORGED-$((40+2))\x07' +
    '\x1b]7770;cmd;00000000000000000000000000000000;echo GUESSED\x07' +
    '\x1b]7770;cwd;/etc\x07' +
    'just a readme\n');
  fs.writeFileSync(path.join(work, 'evil.html'),
    `<script>document.title='api:'+typeof window.gridterm;` +
    `if(window.gridterm)window.gridterm.createSession().then(s=>setTimeout(()=>window.gridterm.write(s.id,'touch ${pwned}\\r'),1000))</script>`);
  const shellPath = require('child_process').execSync(`command -v ${shellName}`, { shell: '/bin/sh' }).toString().trim();

  const app = await _electron.launch({
    args: [path.join(dir, 'out/main/index.js'), '--no-sandbox'], cwd: dir,
    executablePath: require(path.join(dir, 'node_modules/electron')),
    env: { ...process.env, SHELL: shellPath, GRIDTERM_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'gt-cfg-')) }
  });
  const w = await app.firstWindow();
  const key = async (accel) => {
    const parts = accel.split('+'); const k = parts.pop();
    const map = { Control: 'control', Shift: 'shift', Alt: 'alt' };
    await app.evaluate(({ BrowserWindow }, ev) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent(ev), { type: 'keyDown', keyCode: k, modifiers: parts.map(m => map[m]) });
    await w.waitForTimeout(150);
  };
  const run = async (cmd, wait = 700) => { await w.keyboard.type(cmd + '\n'); await w.waitForTimeout(wait); };
  await w.waitForSelector('.tile'); await w.waitForTimeout(1500);

  // ---- 2. Forged messages from program output are ignored ----
  await run(`cd '${work}'`);
  await run('cat evil.txt');
  ok('nonce is not visible to programs', await (async () => { await run('echo "N=[$GRIDTERM_NONCE]"'); return (await w.innerText('.tile.active .xterm-rows')).includes('N=[]'); })());
  // A genuine multi-line command (quote continued onto a second line).
  await w.keyboard.type("echo 'ml-a\n"); await w.waitForTimeout(300);
  await w.keyboard.type("ml-b'\n"); await w.waitForTimeout(700);
  await key('Control+Shift+Enter');
  await w.waitForSelector('.context-panel'); await w.waitForTimeout(300);
  const cmds = await w.$$eval('.ctx-cmd code', els => els.map(e => e.textContent));
  console.log('INFO commands', JSON.stringify(cmds));
  ok('forged command (no nonce) ignored', !cmds.some(c => c.includes('FORGED') || c.includes('git status')));
  ok('forged command (guessed nonce) ignored', !cmds.some(c => c.includes('GUESSED')));
  ok('real commands still recorded', cmds.includes('cat evil.txt') && cmds.some(c => c.includes('ml-a')));
  ok('forged folder ignored', (await w.textContent('.ctx-cwd')) === work);

  // Clicking a multi-line command inserts one line and runs nothing.
  const before = (await w.innerText('.tile.focused .xterm-rows')).split('\n').filter(l => /^ml-a ml-b$|^ml-a$/.test(l.trim())).length;
  await w.click('.ctx-cmd:has-text("ml-a")'); await w.waitForTimeout(800);
  const rows = (await w.innerText('.tile.focused .xterm-rows')).split('\n').map(l => l.trimEnd());
  const last = rows.filter(l => l.trim()).pop();
  ok('clicked command inserted as one line', /echo 'ml-a ml-b'$/.test(last));
  ok('clicked command not executed', rows.filter(l => /^ml-a ml-b$|^ml-a$/.test(l.trim())).length === before);
  await w.keyboard.press('Control+C'); await w.waitForTimeout(300);
  await w.mouse.click(5, 5);

  // ---- 1. Foreign pages can't load in the window ----
  await w.evaluate((u) => { location.href = u; }, 'file://' + path.join(work, 'evil.html'));
  await w.waitForTimeout(2500);
  const appUrl = 'file://' + path.join(dir, 'out/renderer/index.html');
  ok('navigation to another page is blocked', w.url() === appUrl && (await w.$('.tile')) !== null);
  ok('foreign page could not run a command', !fs.existsSync(pwned));
  const popups = await w.evaluate(() => window.open('https://example.com') === null);
  ok('window.open is denied', popups && (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1);
  // A frame with a foreign URL: blocked by CSP / navigation guard, and its IPC would be ignored anyway.
  await w.evaluate((u) => { const f = document.createElement('iframe'); f.src = u; document.body.appendChild(f); }, 'file://' + path.join(work, 'evil.html'));
  await w.waitForTimeout(2000);
  ok('foreign iframe could not run a command', !fs.existsSync(pwned));
  ok('app still works', await (async () => { await run('echo still-$((2*21))'); return (await w.innerText('.tile.active .xterm-rows')).includes('still-42'); })());

  await app.close();
  fs.rmSync(work, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
