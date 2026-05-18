const fs = require('fs');
const path = require('path');

const root = process.cwd();
const versionData = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
const version = versionData.version;

const replacements = [
  ['package.json', /"version":\s*"[^"]+"/, `"version": "${version}"`],
  ['manifest.json', /"version":\s*"[^"]+"/, `"version": "${version}"`],
  ['sw.js', /const APP_VERSION = '[^']+';/, `const APP_VERSION = '${version}';`],
  ['config.js', /APP_VERSION:\s*'[^']+'/, `APP_VERSION: '${version}'`],
  ['index.html', /console\.log\('📱 App Version: [^']+'\);/g, `console.log('📱 App Version: ${version}');`]
];

for (const [file, pattern, replacement] of replacements) {
  const filePath = path.join(root, file);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(pattern, replacement);
  fs.writeFileSync(filePath, content);
}

console.log(`Synced version ${version}`);
