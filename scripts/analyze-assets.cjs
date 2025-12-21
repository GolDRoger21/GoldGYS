const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const INCLUDE_EXT = new Set(['.js', '.css', '.html', '.svg']);

function readFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      files = files.concat(readFiles(fullPath));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (INCLUDE_EXT.has(ext)) {
        const content = fs.readFileSync(fullPath);
        files.push({
          path: fullPath,
          size: content.length,
          gzip: zlib.gzipSync(content).length,
          ext
        });
      }
    }
  }

  return files;
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function summarize(files) {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const totalGzip = files.reduce((sum, file) => sum + file.gzip, 0);
  const byType = files.reduce((acc, file) => {
    acc[file.ext] = acc[file.ext] || { size: 0, gzip: 0, count: 0 };
    acc[file.ext].size += file.size;
    acc[file.ext].gzip += file.gzip;
    acc[file.ext].count += 1;
    return acc;
  }, {});

  console.log('Static asset boyutu (public/):');
  console.log(`  Toplam: ${formatKb(totalSize)} | gzip: ${formatKb(totalGzip)}`);
  Object.entries(byType).forEach(([ext, data]) => {
    console.log(`  ${ext} -> ${data.count} dosya | ${formatKb(data.size)} (gzip: ${formatKb(data.gzip)})`);
  });
}

function printTable(files) {
  const sorted = [...files].sort((a, b) => b.gzip - a.gzip).slice(0, 15);
  console.log('\nEn büyük 15 dosya (gzip):');
  sorted.forEach((file) => {
    const relative = path.relative(process.cwd(), file.path);
    console.log(`  ${formatKb(file.gzip)} gzip | ${formatKb(file.size)} raw | ${relative}`);
  });
}

const files = readFiles(PUBLIC_DIR);
summarize(files);

if (process.argv.includes('--analyze')) {
  printTable(files);
}
