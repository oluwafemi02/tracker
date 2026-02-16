#!/usr/bin/env node
const fs = require('fs');

const targetFile = 'index.html';
const source = fs.readFileSync(targetFile, 'utf8');

const functionRegex = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
const counts = new Map();

for (const match of source.matchAll(functionRegex)) {
  const name = match[1];
  counts.set(name, (counts.get(name) || 0) + 1);
}

const criticalFunctions = [
  'initializeDashboard',
  'setupDashboardControls',
  'getDateRangeFilter',
  'getPreviousPeriodRange',
  'updateDashboardData',
  'updateSpendingTrendChart',
  'exportDashboardData',
  'sendTestNotification',
  'forceClearCacheAndReload',
  'checkForUpdates'
];

const duplicates = criticalFunctions
  .map((name) => ({ name, count: counts.get(name) || 0 }))
  .filter((entry) => entry.count > 1);

if (duplicates.length > 0) {
  console.error('❌ Duplicate critical function definitions found:');
  for (const dup of duplicates) {
    console.error(` - ${dup.name}: ${dup.count}`);
  }
  process.exit(1);
}

console.log('✅ No duplicate critical function definitions found.');
