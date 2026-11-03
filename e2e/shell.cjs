// Shell-integration test without the app: drives bash and zsh in a PTY with
// Gridterm's scripts and checks the messages they send.
// Run: node e2e/shell.cjs
const pty = require('node-pty');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const INTEGRATION = path.resolve(__dirname, '../resources/shell-integration');
const NONCE = 'f'.repeat(32);
let failures = 0;
const ok = (name, cond, detail) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
  if (!cond) { failures++; if (detail !== undefined) console.log('INFO ' + JSON.stringify(detail)); }
};
const has = (cmd) => { try { return execSync(`command -v ${cmd}`, { shell: '/bin/sh' }).toString().trim(); } catch { return null; } };

/** Run `lines` in a shell with integration; returns { messages, output }. */
function runShell(shell, home, lines) {
  return new Promise((resolve) => {
    const env = { ...process.env, HOME: home, TERM: 'xterm-256color', GRIDTERM_NONCE: NONCE, HISTFILE: path.join(home, '.hist') };
    delete env.ZDOTDIR; delete env.GRIDTERM_USER_ZDOTDIR; delete env.PROMPT_COMMAND; delete env.BASH_ENV;
    let args;
    if (path.basename(shell) === 'zsh') { env.ZDOTDIR = path.join(INTEGRATION, 'zsh'); args = ['-l']; }
    else { env.GRIDTERM_BASH_LOGIN = '1'; args = ['--rcfile', path.join(INTEGRATION, 'bash', 'gridterm.bash'), '-i']; }
    const p = pty.spawn(shell, args, { cols: 120, rows: 30, cwd: home, env });
    let out = '';
    let prompts = 0;
    let sent = 0;
    const next = () => { if (sent < lines.length) p.write(lines[sent++] + '\r'); };
    p.onData((d) => {
      out += d;
      // Send the next line each time a prompt is announced (a cwd message).
      const n = (out.match(/\x1b\]7770;cwd;/g) ?? []).length;
      if (n > prompts) { prompts = n; setTimeout(next, 50); }
    });
    p.onExit(() => {
      const messages = [...out.matchAll(/\x1b\]7770;([^;\x07]*);([^;\x07]*);([^\x07]*)\x07/g)].map((m) => ({ kind: m[1], nonce: m[2], payload: m[3] }));
      resolve({ messages, output: out.replace(/\x1b\][^\x07]*\x07/g, '') });
    });
    setTimeout(() => p.kill(), 15000);
  });
}

function home(files = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gt-sh-')));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

(async () => {
  for (const shellName of ['bash', 'zsh']) {
    const shell = has(shellName);
    if (!shell) { console.log(`INFO ${shellName} not installed; skipped`); continue; }
    const rc = shellName === 'zsh' ? { '.zshrc': 'alias hi="echo from-user-rc"\n' } : { '.bashrc': 'alias hi="echo from-user-rc"\n', '.profile': '. ~/.bashrc\n' };
    const h = home(rc);
    const { messages, output } = await runShell(shell, h, ['', 'hi', '', 'false', 'echo "N=[$GRIDTERM_NONCE]"', 'cd /', 'exit']);
    const cmds = messages.filter((m) => m.kind === 'cmd').map((m) => m.payload);
    const dones = messages.filter((m) => m.kind === 'done').map((m) => m.payload);
    ok(`[${shellName}] records exactly the commands typed`, JSON.stringify(cmds) === JSON.stringify(['hi', 'false', 'echo "N=[$GRIDTERM_NONCE]"', 'cd /', 'exit']), cmds);
    ok(`[${shellName}] reports exit codes`, JSON.stringify(dones) === JSON.stringify(['0', '1', '0', '0']), dones);
    ok(`[${shellName}] reports the directory`, messages.some((m) => m.kind === 'cwd' && m.payload === h) && messages.some((m) => m.kind === 'cwd' && m.payload === '/'));
    ok(`[${shellName}] every message carries the nonce`, messages.length > 0 && messages.every((m) => m.nonce === NONCE));
    ok(`[${shellName}] user startup files still load`, output.includes('from-user-rc'));
    ok(`[${shellName}] nonce hidden from programs`, output.includes('N=[]') && !output.includes(`N=[${NONCE}]`));
  }

  // bash 5.1+ with an array PROMPT_COMMAND plus another tool's hook (as systemd's
  // profile script does on newer distros), and a stale history entry.
  const bash = has('bash');
  const major = bash ? Number(execSync(`${bash} -c 'echo $BASH_VERSINFO'`).toString()) : 0;
  const minor = bash ? Number(execSync(`${bash} -c 'echo \${BASH_VERSINFO[1]}'`).toString()) : 0;
  if (bash && (major > 5 || (major === 5 && minor >= 1))) {
    // Same steps as systemd's 80-systemd-osc-context.sh: empty slot 0, hook appended at 1.
    const profile = [
      'other_hook() { :; }',
      '[ -n "$(declare -p PROMPT_COMMAND 2>/dev/null)" ] || PROMPT_COMMAND+=(\'\')',
      'PROMPT_COMMAND+=(other_hook)',
      "PS0='$(:)'",
      'history -s stale-entry'
    ].join('\n') + '\n';
    const h = home({ '.profile': profile });
    const { messages } = await runShell(bash, h, ['', 'echo one', '', 'exit']);
    const cmds = messages.filter((m) => m.kind === 'cmd').map((m) => m.payload);
    ok('[bash] array PROMPT_COMMAND: other hooks are not commands', JSON.stringify(cmds) === JSON.stringify(['echo one', 'exit']), cmds);
  } else {
    console.log('INFO bash < 5.1: array PROMPT_COMMAND test skipped');
  }
  process.exit(failures ? 1 : 0);
})();
