// The app version must match everywhere, and must go up whenever app files change.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const fromJs = (src) => src.match(/VERSION = '([^']+)'/)?.[1];
const versions = {
  'js/version.js': fromJs(readFileSync('js/version.js', 'utf8')),
  'package.json': JSON.parse(readFileSync('package.json', 'utf8')).version,
  'version.json': JSON.parse(readFileSync('version.json', 'utf8')).version,
  'sw.js CACHE_NAME': readFileSync('sw.js', 'utf8').match(/CACHE_NAME = 'tracker-v([^']+)'/)?.[1],
  'CHANGELOG.md': readFileSync('CHANGELOG.md', 'utf8').match(/^## (\d+\.\d+\.\d+)/m)?.[1],
};
const v = versions['js/version.js'];
const wrong = Object.entries(versions).filter(([, x]) => x !== v);
if (wrong.length) {
  console.error(`Version mismatch: js/version.js says ${v}, but ${wrong.map(([f, x]) => `${f} says ${x}`).join(', ')}`);
  process.exit(1);
}

// Compare with the previous commit (CI checks out 2 commits).
const sh = (c) => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };
const base = process.env.VERSION_BASE || 'HEAD~1';
const changed = sh(`git diff --name-only ${base} HEAD`);
const before = sh(`git show ${base}:js/version.js`);
if (changed != null && before != null) {
  const appChanged = changed.split('\n').some((f) => /^(js\/|css\/|index\.html$|sw\.js$|manifest\.json$|icons\/|fonts\/)/.test(f) && f !== 'js/version.js');
  const prev = fromJs(before);
  const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
  if (appChanged && !newer(v, prev)) {
    console.error(`App files changed but the version is still ${prev}. Bump it in js/version.js (and package.json, version.json, sw.js, CHANGELOG.md).`);
    process.exit(1);
  }
}
console.log(`version ok: ${v}`);
