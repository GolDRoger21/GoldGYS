#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "public", "js");
const violations = [];
const warnings = [];

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && full.endsWith(".js")) out.push(full);
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function findQueryClose(text, queryStartIndex) {
  let depth = 0;
  for (let i = queryStartIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.includes("getDocs(collection(")) {
      violations.push(`${filePath}:${idx + 1} uses getDocs(collection(...)) without query/limit`);
    }
    if (trimmed.includes("offset(")) {
      violations.push(`${filePath}:${idx + 1} uses offset(...), which is forbidden`);
    }
  });

  const callPattern = /getDocs\s*\(\s*query\s*\(/g;
  let match;
  while ((match = callPattern.exec(content)) !== null) {
    const getDocsIdx = match.index;

    const queryStart = getDocsIdx + "getDocs(".length;
    const queryEnd = findQueryClose(content, queryStart);
    if (queryEnd === -1) {
      violations.push(`${filePath}:${lineOf(content, getDocsIdx)} malformed getDocs(query(...)) call`);
      break;
    }

    const queryChunk = content.slice(queryStart, queryEnd + 1);
    const atLine = lineOf(content, getDocsIdx);

    if (!queryChunk.includes("limit(")) {
      violations.push(`${filePath}:${atLine} query without limit(...)`);
    }
    if (queryChunk.includes("offset(")) {
      violations.push(`${filePath}:${atLine} query uses offset(...), which is forbidden`);
    }
    if (!queryChunk.includes("orderBy(")) {
      warnings.push(`${filePath}:${atLine} query has no orderBy(...) (deterministic pagination standard)`);
    }

    callPattern.lastIndex = queryEnd + 1;
  }
}

if (!fs.existsSync(ROOT)) {
  console.error(`Audit root not found: ${ROOT}`);
  process.exit(1);
}

const files = walk(ROOT);
files.forEach(scanFile);

if (warnings.length > 0) {
  console.warn("Firestore query audit warnings:");
  warnings.forEach((w) => console.warn(` - ${w}`));
}

if (violations.length > 0) {
  console.error("Firestore query audit failed:");
  violations.forEach((v) => console.error(` - ${v}`));
  process.exit(1);
}

console.log("Firestore query audit passed.");
