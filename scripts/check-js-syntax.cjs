const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const TARGET_DIR = path.join(ROOT, "public", "js");

function collectJsFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".js")) {
      out.push(fullPath);
    }
  }
  return out;
}

if (!fs.existsSync(TARGET_DIR)) {
  console.error(`Target directory not found: ${TARGET_DIR}`);
  process.exit(1);
}

const jsFiles = collectJsFiles(TARGET_DIR).sort();
if (jsFiles.length === 0) {
  console.log("No JS files found under public/js.");
  process.exit(0);
}

for (const filePath of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${jsFiles.length} JS files.`);
