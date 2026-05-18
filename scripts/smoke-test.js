const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const checks = ['id="expenseForm"','id="expensesList"','serviceWorker'];
for (const token of checks) {
  if (!html.includes(token)) {
    console.error(`Smoke test failed: missing ${token}`);
    process.exit(1);
  }
}
console.log('Smoke tests passed');
