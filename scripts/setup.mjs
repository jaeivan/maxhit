// One-time setup: fetch the OSRS Wiki DPS engine at a pinned commit, apply our perf patch,
// and generate the special-item/set metadata from its source.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const REPO = 'https://github.com/weirdgloop/osrs-dps-calc.git';
const COMMIT = process.env.ENGINE_COMMIT ?? 'ac9f3b2d0b6b037b5eff61f0004563b9e3962ecb'; // 2026-11-08
const run = (cmd) => { console.log(`> ${cmd}`); execSync(cmd, { stdio: 'inherit' }); };

if (!fs.existsSync('engine/.git')) {
  run(`git clone --filter=blob:none ${REPO} engine`);
}
run(`git -C engine fetch --quiet origin ${COMMIT}`);
run(`git -C engine checkout --quiet --force ${COMMIT}`);
const patch = '../patches/engine-perf.patch';
const ok = (cmd) => { try { execSync(cmd, { stdio: 'ignore' }); return true; } catch { return false; } };
if (ok(`git -C engine apply --check ${patch}`)) {
  run(`git -C engine apply ${patch}`);
} else if (ok(`git -C engine apply --reverse --check ${patch}`)) {
  console.log('Perf patch already applied.');
} else {
  console.error('Could not apply patches/engine-perf.patch to this engine version. Results will be correct but ~10x slower.');
  process.exitCode = 1;
}
run('node scripts/gen-meta.mjs');
console.log('\nSetup done. Start the optimizer with: npm run dev');
