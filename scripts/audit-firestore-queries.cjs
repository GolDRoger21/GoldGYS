#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public', 'js');
const TARGET_FILES = new Set([
  'dashboard.js',
  'analysis.js',
  'site-config.js',
  'ui-loader.js'
]);
const violations = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    if (!TARGET_FILES.has(path.basename(full))) continue;

    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, idx) => {
      const t = line.trim();
      if (t.includes('getDocs(collection(')) {
        violations.push(`${full}:${idx + 1} uses getDocs(collection(...)) without limit/query`);
      }
    });

    let cursor = 0;
    while (true) {
      const start = content.indexOf('getDocs(query(', cursor);
      if (start === -1) break;
      const end = content.indexOf('));', start);
      if (end === -1) break;
      const chunk = content.slice(start, end);
      if (!chunk.includes('limit(')) {
        const line = content.slice(0, start).split(/\r?\n/).length;
        violations.push(`${full}:${line} query without limit(...)`);
      }
      cursor = end + 3;
    }
  }
}

walk(ROOT);
if (violations.length) {
  console.error('Firestore query audit failed:');
  violations.forEach((v) => console.error(` - ${v}`));
  process.exit(1);
}
console.log('Firestore query audit passed.');