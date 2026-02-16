#!/usr/bin/env node
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

const checks = [
  {
    name: 'rollover analytics exported globally',
    test: html.includes('window.updateRolloverAnalytics = updateRolloverAnalytics;')
  },
  {
    name: 'dashboard calls guarded rollover analytics',
    test: html.includes("if (typeof window.updateRolloverAnalytics === 'function') window.updateRolloverAnalytics();")
  },
  {
    name: 'no standalone async token lines',
    test: !/^\s*async\s*$/m.test(html)
  }
];

const failed = checks.filter((c) => !c.test);
if (failed.length) {
  console.error('❌ Runtime guard checks failed:');
  failed.forEach((f) => console.error(` - ${f.name}`));
  process.exit(1);
}

console.log('✅ Runtime guard checks passed.');
