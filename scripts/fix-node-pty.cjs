// node-pty 1.1.0 ships its macOS `spawn-helper` without the executable bit,
// so starting a shell fails on macOS ("posix_spawnp failed"). Restore it.
// Runs on `npm install` / `npm ci`; never fails the install.
const fs = require('fs');
const path = require('path');

try {
  const root = path.dirname(require.resolve('node-pty/package.json'));
  const candidates = [path.join(root, 'build', 'Release', 'spawn-helper')];
  const prebuilds = path.join(root, 'prebuilds');
  if (fs.existsSync(prebuilds)) {
    for (const dir of fs.readdirSync(prebuilds)) candidates.push(path.join(prebuilds, dir, 'spawn-helper'));
  }
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const mode = fs.statSync(file).mode;
    if ((mode & 0o111) !== 0o111) {
      fs.chmodSync(file, mode | 0o755);
      console.log(`gridterm: made ${path.relative(process.cwd(), file)} executable`);
    }
  }
} catch (e) {
  console.warn(`gridterm: could not check node-pty's spawn-helper: ${e.message}`);
}
