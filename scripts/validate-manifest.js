const fs = require('fs');
const raw = fs.readFileSync('manifest.json', 'utf8');

function findTopLevelDuplicateKeys(jsonText) {
  const duplicates = new Set();
  const seen = new Set();
  let i = 0, depth = 0, inStr = false, esc = false;
  while (i < jsonText.length) {
    const ch = jsonText[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      i++; continue;
    }
    if (ch === '"') {
      // candidate key at top level object depth=1
      let j = i + 1, key = '';
      while (j < jsonText.length) {
        const c = jsonText[j];
        if (c === '\\') { key += jsonText[j+1] || ''; j += 2; continue; }
        if (c === '"') break;
        key += c; j++;
      }
      let k = j + 1;
      while (k < jsonText.length && /\s/.test(jsonText[k])) k++;
      if (depth === 1 && jsonText[k] === ':') {
        if (seen.has(key)) duplicates.add(key);
        seen.add(key);
      }
      i = j + 1;
      continue;
    }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    i++;
  }
  return [...duplicates];
}

const duplicates = findTopLevelDuplicateKeys(raw);
if (duplicates.length) {
  console.error('Duplicate top-level keys in manifest.json:', duplicates.join(', '));
  process.exit(1);
}
const manifest = JSON.parse(raw);
for (const required of ['name','short_name','start_url','display','icons']) {
  if (!(required in manifest)) {
    console.error(`Missing required field: ${required}`);
    process.exit(1);
  }
}
console.log('manifest.json validation passed');
