// Checks that every file the service worker caches exists, and every app module is cached.
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const sw = readFileSync('sw.js', 'utf8');
const shell = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]).filter((f) => f !== './');
let ok = true;
for (const f of shell) if (!existsSync(f)) { console.error(`sw.js caches a missing file: ${f}`); ok = false; }
for (const f of readdirSync('js')) if (!shell.includes(`js/${f}`)) { console.error(`js/${f} is not in the sw.js SHELL list`); ok = false; }
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
for (const i of manifest.icons) if (!existsSync(i.src)) { console.error(`manifest icon missing: ${i.src}`); ok = false; }
if (!ok) process.exit(1);
console.log(`shell ok: ${shell.length} files`);
