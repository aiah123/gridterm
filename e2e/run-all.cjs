// Runs every end-to-end suite (bash and zsh where relevant), prints a summary,
// and exits non-zero if anything failed. Run after `npm run build`.
const { spawnSync } = require('child_process');
const path = require('path');

const suites = [
  ['smoke.cjs'], ['config.cjs'], ['restore.cjs'],
  ['context.cjs', 'bash'], ['context.cjs', 'zsh'],
  ['security.cjs', 'bash'], ['security.cjs', 'zsh']
];
let failed = 0;
const summary = [];
for (const [file, ...args] of suites) {
  const name = [file.replace('.cjs', ''), ...args].join(' ');
  console.log(`\n=== ${name} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, file), ...args], { encoding: 'utf8', timeout: 5 * 60 * 1000 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(out.split('\n').filter((l) => /^(PASS|FAIL|INFO)|Error|^\s+at /.test(l)).join('\n') + '\n');
  const pass = (out.match(/^PASS /gm) ?? []).length;
  const fail = (out.match(/^FAIL /gm) ?? []).length;
  const ok = r.status === 0 && fail === 0 && pass > 0;
  if (!ok) failed++;
  summary.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${pass} passed, ${fail} failed${r.status !== 0 ? ` (exit ${r.status ?? r.signal})` : ''}`);
}
console.log('\n=== Summary ===\n' + summary.join('\n'));
process.exit(failed ? 1 : 0);
